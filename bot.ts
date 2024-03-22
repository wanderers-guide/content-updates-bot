import { createClient } from '@supabase/supabase-js';
import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  Partials,
  type PartialMessage,
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/update' && req.method === 'POST') return await handleNewUpdate(req);
    return new Response('404!');
  },
});

async function handleNewUpdate(req: Request) {
  const data = (await req.json()) as UpdatePackage;

  const response = await postContentUpdate(data);

  return new Response(
    JSON.stringify({
      status: response.success ? 'success' : 'error',
      message_id: response.messageId,
    }),
    { status: response.success ? 200 : 500 }
  );
}

async function postContentUpdate(data: UpdatePackage) {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID ?? '');
  if (!channel?.isTextBased()) {
    return { success: false };
  }

  const objName = data.update.data?.name ? data.update.data.name : data.update.type;

  if (data.update.action === 'UPDATE') {
    const message = await channel.send({
      content: `
  
**Update Request from ${data.username} (#${data.update.user_id})**
> _To change \`${objName}\` from the ${data.source}._
> https://wanderersguide.app/content-update/8

    `.trim(),
    });
    await message.react('✅');
    await message.react('❌');
    await message.react('👍');
    await message.react('👎');

    return { success: true, messageId: message.id };
  }

  return { success: false };
}

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  let message = reaction.message;
  if (message.partial) {
    try {
      message = await message.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the message:', error);
      return;
    }
  }
  if (message.author?.id !== client.user?.id) return;

  const member = message?.guild?.members.cache.get(user.id);

  if (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') {
    if (member?.roles.cache.has(process.env.ROLE_ID ?? '')) {
      if (reaction.emoji.name === '✅') {
        const rejectReaction = message.reactions.cache.find((r) => r.emoji.name === '❌');
        if (rejectReaction) {
          try {
            await rejectReaction.remove();
          } catch (error) {
            console.error('Failed to remove the reject reaction:', error);
          }
        }

        await updateContentUpdate({
          discord_msg_id: message.id,
          discord_user_id: user.id,
          discord_user_name: user.displayName,
          state: 'APPROVE',
        });

        return;
      }

      if (reaction.emoji.name === '❌') {
        const approveReaction = message.reactions.cache.find((r) => r.emoji.name === '✅');
        if (approveReaction) {
          try {
            await approveReaction.remove();
          } catch (error) {
            console.error('Failed to remove the approve reaction:', error);
          }
        }

        await updateContentUpdate({
          discord_msg_id: message.id,
          discord_user_id: user.id,
          discord_user_name: user.displayName,
          state: 'REJECT',
        });

        return;
      }
    } else {
      if (user.partial) {
        try {
          user = await user.fetch();
        } catch (error) {
          console.error('Something went wrong when fetching the user:', error);
          return;
        }
      }

      // Remove their reaction
      reaction.users.remove(user).catch(console.error);
      return;
    }
  } else if (reaction.emoji.name === '👍' || reaction.emoji.name === '👎') {
    if (reaction.emoji.name === '👍') {
      // Remove their thumbs down reaction
      const thumbsDownReaction = message.reactions.cache.find((r) => r.emoji.name === '👎');
      if (thumbsDownReaction) {
        try {
          await thumbsDownReaction.users.remove(user.id);
        } catch (error) {
          console.error('Failed to remove the thumbs down reaction:', error);
        }
      }

      await updateContentUpdate({
        discord_msg_id: message.id,
        discord_user_id: user.id,
        discord_user_name: user.displayName,
        state: 'UPVOTE',
      });

      return;
    } else if (reaction.emoji.name === '👎') {
      // Remove their thumbs up reaction
      const thumbsUpReaction = message.reactions.cache.find((r) => r.emoji.name === '👍');
      if (thumbsUpReaction) {
        try {
          await thumbsUpReaction.users.remove(user.id);
        } catch (error) {
          console.error('Failed to remove the thumbs up reaction:', error);
        }
      }

      await updateContentUpdate({
        discord_msg_id: message.id,
        discord_user_id: user.id,
        discord_user_name: user.displayName,
        state: 'DOWNVOTE',
      });

      return;
    }
  }
});

const supabase = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_KEY ?? '');
async function updateContentUpdate(change: {
  discord_msg_id: string;
  discord_user_id: string;
  discord_user_name: string;
  state: 'APPROVE' | 'REJECT' | 'UPVOTE' | 'DOWNVOTE';
}) {
  const { data, error } = await supabase.functions.invoke('update-content-update', {
    body: {
      auth_token: process.env.CONTENT_UPDATE_KEY, // TODO: Should be in a header
      discord_msg_id: change.discord_msg_id,
      discord_user_id: change.discord_user_id,
      discord_user_name: change.discord_user_name,
      state: change.state,
    },
  });
  if (error) {
    console.error('Failed to update content update:', error);
  }
  console.log(data);
  return data ? true : false;
}
