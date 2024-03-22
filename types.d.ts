interface UpdatePackage {
  username: string;
  source: string;
  update: ContentUpdate;
}

interface ContentUpdate {
  id: number;
  created_at: string;
  user_id: string;
  type: string;
  ref_id?: number;
  action: 'UPDATE' | 'CREATE' | 'DELETE';
  data: Record<string, any>;
  content_source_id: number;
  status: {
    state: 'PENDING' | 'APPROVED' | 'REJECTED';
    discord_user_id?: string;
    discord_user_name?: string;
  };
  upvotes: {
    discord_user_id: string;
  }[];
  downvotes: {
    discord_user_id: string;
  }[];
  discord_msg_id?: string;
}
