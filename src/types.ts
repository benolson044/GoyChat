export interface Server {
  id: string;
  name: string;
  icon?: string;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  content: string;
  timestamp: string;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}
