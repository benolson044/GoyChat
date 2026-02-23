import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Hash, 
  Settings, 
  Mic, 
  Headphones, 
  Plus, 
  Compass, 
  Download,
  Send,
  User as UserIcon,
  Search,
  Bell,
  Pin,
  Users,
  AtSign,
  HelpCircle,
  MoreVertical,
  Volume2,
  MicOff,
  PhoneOff,
  Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import { Server, Channel, Message, User } from './types';
import { cn } from './lib/utils';

const MOCK_USER: User = {
  id: 'user-' + Math.random().toString(36).substr(2, 4),
  name: 'OPERATOR_' + Math.random().toString(36).substr(2, 4).toUpperCase(),
  status: 'online'
};

export default function App() {
  useEffect(() => {
    console.log('GoyChat App Mounted');
  }, []);

  const socketRef = useRef<Socket | null>(null);
  if (!socketRef.current) {
    socketRef.current = io();
  }
  const socket = socketRef.current;

  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(null);
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<Channel | null>(null);
  const [voiceParticipants, setVoiceParticipants] = useState<Record<string, { socketId: string, userId: string, userName: string }[]>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/servers')
      .then(res => res.json())
      .then(data => {
        setServers(data);
        if (data.length > 0) setActiveServer(data[0]);
      });
  }, []);

  useEffect(() => {
    if (activeServer) {
      fetch(`/api/servers/${activeServer.id}/channels`)
        .then(res => res.json())
        .then(data => {
          setChannels(data);
          if (data.length > 0) setActiveChannel(data[0]);
        });
    }
  }, [activeServer]);

  useEffect(() => {
    if (activeChannel) {
      fetch(`/api/channels/${activeChannel.id}/messages`)
        .then(res => res.json())
        .then(setMessages);

      socket.emit('join-channel', activeChannel.id);
    }
  }, [activeChannel, socket]);

  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      if (message.channel_id === activeChannel?.id) {
        setMessages(prev => [...prev, message]);
        // Play notification sound if not from self
        if (message.user_id !== MOCK_USER.id) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
          audio.volume = 0.2;
          audio.play().catch(() => {});
        }
      }
    };

    const handleTypingUpdate = (users: string[]) => {
      setTypingUsers(users.filter(u => u !== MOCK_USER.name));
    };

    socket.on('new-message', handleNewMessage);
    socket.on('typing-update', handleTypingUpdate);
    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('typing-update', handleTypingUpdate);
    };
  }, [activeChannel, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleJoined = ({ socketId, userId, userName }: any) => {
      if (!activeVoiceChannel) return;
      setVoiceParticipants(prev => ({
        ...prev,
        [activeVoiceChannel.id]: [
          ...(prev[activeVoiceChannel.id] || []),
          { socketId, userId, userName }
        ]
      }));
    };

    const handleLeft = (socketId: string) => {
      setVoiceParticipants(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(channelId => {
          next[channelId] = next[channelId].filter(p => p.socketId !== socketId);
        });
        return next;
      });
    };

    const handleList = (participants: any[]) => {
      if (!activeVoiceChannel) return;
      setVoiceParticipants(prev => ({
        ...prev,
        [activeVoiceChannel.id]: [
          { socketId: socket.id!, userId: MOCK_USER.id, userName: MOCK_USER.name },
          ...participants
        ]
      }));
    };

    socket.on('user-joined-voice', handleJoined);
    socket.on('user-left-voice', handleLeft);
    socket.on('voice-users-list', handleList);

    return () => {
      socket.off('user-joined-voice', handleJoined);
      socket.off('user-left-voice', handleLeft);
      socket.off('voice-users-list', handleList);
    };
  }, [activeVoiceChannel, socket]);

  const joinVoice = async (channel: Channel) => {
    if (activeVoiceChannel?.id === channel.id) return;
    if (activeVoiceChannel) leaveVoice();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setActiveVoiceChannel(channel);
      socket.emit('join-voice', {
        channelId: channel.id,
        userId: MOCK_USER.id,
        userName: MOCK_USER.name
      });
    } catch (err) {
      console.error("Failed to get media", err);
    }
  };

  const leaveVoice = () => {
    if (!activeVoiceChannel) return;
    socket.emit('leave-voice', activeVoiceChannel.id);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setActiveVoiceChannel(null);
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted && !isDeafened;
      });
    }
  };

  const toggleDeafen = () => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted && !newDeafened;
      });
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChannel) return;

    socket.emit('typing-stop', { channelId: activeChannel.id, userName: MOCK_USER.name });
    socket.emit('send-message', {
      channelId: activeChannel.id,
      userId: MOCK_USER.id,
      userName: MOCK_USER.name,
      content: newMessage
    });
    setNewMessage('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (activeChannel) {
      if (e.target.value.length > 0) {
        socket.emit('typing-start', { channelId: activeChannel.id, userName: MOCK_USER.name });
      } else {
        socket.emit('typing-stop', { channelId: activeChannel.id, userName: MOCK_USER.name });
      }
    }
  };

  return (
    <div className="flex h-screen w-full bg-void overflow-hidden font-sans selection:bg-crimson/30">
      <AnimatePresence>
        {selectedProfileUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedProfileUser(null)}
            className="fixed inset-0 z-[110] bg-void/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-80 bg-ash brutalist-border overflow-hidden shadow-[0_0_50px_rgba(255,0,0,0.2)]"
            >
              <div className="h-20 bg-crimson" />
              <div className="px-4 pb-4 relative">
                <div className="absolute -top-10 left-4">
                  <div className="w-20 h-20 bg-void rounded-full p-1">
                    <div className="w-full h-full bg-crimson rounded-full flex items-center justify-center text-2xl font-bold border-4 border-void">
                      {selectedProfileUser.name.substring(0, 2)}
                    </div>
                  </div>
                  <div className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 rounded-full border-4 border-void" />
                </div>
                
                <div className="mt-12">
                  <div className="text-xl font-bold tracking-tight">{selectedProfileUser.name}</div>
                  <div className="text-ash text-xs font-mono mb-4">OPERATOR_ACCESS_GRANTED</div>
                  
                  <div className="h-[1px] bg-crimson/10 my-4" />
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-[10px] font-bold text-ash uppercase tracking-widest mb-1">About Me</h3>
                      <p className="text-xs text-white/80 leading-relaxed">
                        GoyChat network operative. Specializing in crimson-tier encrypted communications.
                      </p>
                    </div>
                    
                    <div>
                      <h3 className="text-[10px] font-bold text-ash uppercase tracking-widest mb-1">Member Since</h3>
                      <p className="text-xs text-white/80">Feb 22, 2026</p>
                    </div>
                  </div>
                  
                  <button className="w-full mt-6 py-2 bg-crimson text-white font-bold text-xs uppercase tracking-widest hover:bg-rust transition-colors">
                    Send Message
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showSettings && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[100] bg-void/90 backdrop-blur-xl flex items-center justify-center p-8"
          >
            <div className="w-full max-w-4xl h-full flex brutalist-border bg-ash/50 overflow-hidden">
              <div className="w-64 bg-void/50 brutalist-border-r p-6 flex flex-col gap-1">
                <h2 className="text-[10px] font-bold text-ash uppercase tracking-widest mb-4">User Settings</h2>
                <div className="px-3 py-1.5 bg-crimson/10 text-white rounded brutalist-border border-crimson/40 cursor-pointer">My Account</div>
                <div className="px-3 py-1.5 text-ash hover:text-white hover:bg-white/5 rounded cursor-pointer transition-colors">Profiles</div>
                <div className="px-3 py-1.5 text-ash hover:text-white hover:bg-white/5 rounded cursor-pointer transition-colors">Privacy & Safety</div>
                <div className="h-[1px] bg-crimson/10 my-2" />
                <h2 className="text-[10px] font-bold text-ash uppercase tracking-widest mb-4 mt-4">App Settings</h2>
                <div className="px-3 py-1.5 text-ash hover:text-white hover:bg-white/5 rounded cursor-pointer transition-colors">Appearance</div>
                <div className="px-3 py-1.5 text-ash hover:text-white hover:bg-white/5 rounded cursor-pointer transition-colors">Accessibility</div>
                <div className="px-3 py-1.5 text-ash hover:text-white hover:bg-white/5 rounded cursor-pointer transition-colors">Voice & Video</div>
                <div className="mt-auto">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full py-2 brutalist-border border-crimson text-crimson hover:bg-crimson hover:text-white transition-all font-bold uppercase tracking-widest text-xs"
                  >
                    Exit Terminal
                  </button>
                </div>
              </div>
              <div className="flex-1 p-12 overflow-y-auto">
                <h1 className="text-4xl font-bold tracking-tighter mb-8 text-crimson">GOY_ACCOUNT</h1>
                <div className="space-y-8">
                  <div className="bg-void/80 p-6 brutalist-border">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-crimson rounded-full flex items-center justify-center text-2xl font-bold">
                        {MOCK_USER.name.substring(0, 2)}
                      </div>
                      <div className="flex-1">
                        <div className="text-2xl font-bold tracking-tight">{MOCK_USER.name}</div>
                        <div className="text-ash font-mono">ID: {MOCK_USER.id}</div>
                      </div>
                      <button className="px-4 py-2 bg-crimson text-white font-bold text-xs uppercase tracking-widest hover:bg-rust transition-colors">Edit Profile</button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 brutalist-border bg-void/30">
                      <h3 className="text-xs font-bold text-ash uppercase tracking-widest mb-2">Email</h3>
                      <div className="text-sm font-mono">operator@void.network</div>
                    </div>
                    <div className="p-6 brutalist-border bg-void/30">
                      <h3 className="text-xs font-bold text-ash uppercase tracking-widest mb-2">Phone Number</h3>
                      <div className="text-sm font-mono">********42</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Server Sidebar */}
      <div className="w-[72px] flex flex-col items-center py-3 brutalist-border-r bg-void z-50">
        <div className="mb-2 group relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full scale-y-0 group-hover:scale-y-100 transition-transform origin-left" />
          <div className="w-12 h-12 bg-crimson flex items-center justify-center rounded-[24px] hover:rounded-[16px] transition-all cursor-pointer shadow-[0_0_15px_rgba(255,0,0,0.3)]">
            <UserIcon className="text-white w-7 h-7" />
          </div>
        </div>
        
        <div className="w-8 h-[2px] bg-ash my-2" />

        <div className="flex-1 flex flex-col gap-2 overflow-y-auto no-scrollbar">
          {servers.map(server => (
            <div 
              key={server.id} 
              className="group relative"
              onClick={() => setActiveServer(server)}
            >
              <div className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 w-1 bg-white rounded-r-full transition-all origin-left",
                activeServer?.id === server.id ? "h-10 scale-y-100" : "h-5 scale-y-0 group-hover:scale-y-100"
              )} />
              <div className={cn(
                "w-12 h-12 flex items-center justify-center transition-all cursor-pointer brutalist-border",
                activeServer?.id === server.id 
                  ? "rounded-[16px] bg-crimson/20 border-crimson shadow-[0_0_10px_rgba(255,0,0,0.2)]" 
                  : "rounded-[24px] bg-ash hover:rounded-[16px] hover:bg-crimson/10 hover:border-crimson/40"
              )}>
                <span className="text-xs font-bold tracking-tighter">{server.name.substring(0, 2).toUpperCase()}</span>
              </div>
            </div>
          ))}
          
          <div className="group relative">
            <div className="w-12 h-12 bg-ash flex items-center justify-center rounded-[24px] hover:rounded-[16px] hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer brutalist-border">
              <Plus className="text-emerald-500 w-6 h-6" />
            </div>
          </div>
          
          <div className="group relative">
            <div className="w-12 h-12 bg-ash flex items-center justify-center rounded-[24px] hover:rounded-[16px] hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer brutalist-border">
              <Compass className="text-emerald-500 w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <div className="w-12 h-12 bg-ash flex items-center justify-center rounded-[24px] hover:rounded-[16px] hover:bg-crimson/20 hover:border-crimson/40 transition-all cursor-pointer brutalist-border">
            <Download className="text-crimson w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Channel Sidebar */}
      <div className="w-60 flex flex-col bg-ash/30 brutalist-border-r">
        <div className="h-12 px-4 flex items-center brutalist-border-b hover:bg-white/5 cursor-pointer transition-colors group">
          <h1 className="font-bold text-sm tracking-tight flex-1 truncate">{activeServer?.name || 'SELECT SERVER'}</h1>
          <MoreVertical className="w-4 h-4 text-ash group-hover:text-white transition-colors" />
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          <div className="flex items-center px-2 py-1 mb-1 group cursor-pointer">
            <span className="text-[11px] font-bold text-ash group-hover:text-white/70 uppercase tracking-widest flex-1">Text Channels</span>
            <Plus className="w-3.5 h-3.5 text-ash group-hover:text-white" />
          </div>
          
          {channels.map(channel => (
            <div key={channel.id} className="flex flex-col">
              <div 
                onClick={() => channel.type === 'text' ? setActiveChannel(channel) : joinVoice(channel)}
                className={cn(
                  "group flex items-center px-2 py-1.5 rounded-md cursor-pointer transition-all",
                  (channel.type === 'text' ? activeChannel?.id === channel.id : activeVoiceChannel?.id === channel.id)
                    ? "bg-crimson/10 text-white border border-crimson/20" 
                    : "text-ash hover:bg-white/5 hover:text-white/80"
                )}
              >
                {channel.type === 'text' ? (
                  <Hash className={cn("w-4 h-4 mr-1.5", activeChannel?.id === channel.id ? "text-crimson" : "text-ash")} />
                ) : (
                  <Volume2 className={cn("w-4 h-4 mr-1.5", activeVoiceChannel?.id === channel.id ? "text-crimson" : "text-ash")} />
                )}
                <span className="text-sm font-medium tracking-tight">{channel.name}</span>
                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Settings className="w-3.5 h-3.5 text-ash hover:text-white" />
                </div>
              </div>
              
              {channel.type === 'voice' && (
                <div className="ml-7 flex flex-col gap-1 mt-1 mb-2">
                  {voiceParticipants[channel.id]?.map(participant => (
                    <div key={participant.socketId} className="flex items-center gap-2 py-1 group/user">
                      <div className="w-5 h-5 bg-crimson rounded-full flex items-center justify-center text-[8px] font-bold border border-white/5">
                        {participant.userName.substring(0, 2)}
                      </div>
                      <span className="text-xs text-white/70 group-hover/user:text-white transition-colors truncate">
                        {participant.userName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Voice Status Bar */}
        {activeVoiceChannel && (
          <div className="h-14 bg-void/80 brutalist-border-t px-3 flex flex-col justify-center gap-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Radio className="w-4 h-4 text-emerald-500 animate-pulse flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest leading-none">Voice Connected</div>
                  <div className="text-[10px] text-ash truncate">{activeVoiceChannel.name} / {activeServer?.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors group">
                  <HelpCircle className="w-4 h-4 text-ash group-hover:text-white" />
                </div>
                <div 
                  onClick={leaveVoice}
                  className="p-1.5 hover:bg-crimson/20 rounded-md cursor-pointer transition-colors group"
                >
                  <PhoneOff className="w-4 h-4 text-crimson" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Status */}
        <div className="h-14 bg-void/50 px-2 flex items-center gap-2 brutalist-border-t">
          <div className="relative">
            <div className="w-8 h-8 bg-crimson rounded-full flex items-center justify-center text-[10px] font-bold border border-white/10">
              {MOCK_USER.name.substring(0, 2)}
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-void" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate tracking-tight">{MOCK_USER.name}</div>
            <div className="text-[10px] text-ash truncate uppercase tracking-tighter">#0001</div>
          </div>
          <div className="flex items-center gap-0.5">
            <div 
              onClick={toggleMute}
              className="p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors group"
            >
              {isMuted || isDeafened ? (
                <MicOff className="w-4 h-4 text-crimson" />
              ) : (
                <Mic className="w-4 h-4 text-ash group-hover:text-white" />
              )}
            </div>
            <div 
              onClick={toggleDeafen}
              className="p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors group"
            >
              {isDeafened ? (
                <Headphones className="w-4 h-4 text-crimson" />
              ) : (
                <Headphones className="w-4 h-4 text-ash group-hover:text-white" />
              )}
            </div>
            <div 
              onClick={() => setShowSettings(true)}
              className="p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors group"
            >
              <Settings className="w-4 h-4 text-ash group-hover:text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-void relative">
        {/* Header */}
        <div className="h-12 px-4 flex items-center brutalist-border-b bg-void/80 backdrop-blur-sm z-10">
          <Hash className="w-5 h-5 text-ash mr-2" />
          <h2 className="font-bold text-sm tracking-tight">{activeChannel?.name || 'select_channel'}</h2>
          
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-1 text-ash hover:text-white cursor-pointer transition-colors">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-ash hover:text-white cursor-pointer transition-colors">
              <Pin className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-ash hover:text-white cursor-pointer transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search" 
                className="bg-ash/50 border border-crimson/10 rounded px-2 py-0.5 text-xs w-36 focus:w-48 transition-all focus:outline-none focus:border-crimson/40"
              />
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ash" />
            </div>
            <AtSign className="w-5 h-5 text-ash hover:text-white cursor-pointer" />
            <HelpCircle className="w-5 h-5 text-ash hover:text-white cursor-pointer" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
          <div className="mb-8 pt-10">
            <div className="w-16 h-16 bg-ash flex items-center justify-center rounded-full mb-4 brutalist-border">
              <Hash className="w-10 h-10 text-crimson" />
            </div>
            <h1 className="text-3xl font-bold tracking-tighter mb-1">Welcome to #{activeChannel?.name}!</h1>
            <p className="text-ash text-sm">This is the start of the #{activeChannel?.name} channel.</p>
            <div className="h-[1px] bg-crimson/10 w-full my-6" />
          </div>

          {messages.map((msg, i) => {
            const isSameUserAsPrev = i > 0 && messages[i-1].user_id === msg.user_id;
            
            return (
              <div key={msg.id} className={cn("group flex gap-4 hover:bg-white/[0.02] -mx-4 px-4 py-1 transition-colors", !isSameUserAsPrev && "mt-4")}>
                {!isSameUserAsPrev ? (
                  <div className="w-10 h-10 bg-ash/50 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold brutalist-border group-hover:border-crimson/40 transition-colors">
                    {msg.user_name.substring(0, 2)}
                  </div>
                ) : (
                  <div className="w-10 flex-shrink-0 flex justify-end pr-2">
                    <span className="text-[10px] text-ash opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                  <div className="flex-1 min-w-0">
                  {!isSameUserAsPrev && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span 
                        onClick={() => setSelectedProfileUser({ id: msg.user_id, name: msg.user_name, status: 'online' })}
                        className="font-bold text-sm tracking-tight hover:underline cursor-pointer text-crimson"
                      >
                        {msg.user_name}
                      </span>
                      <span className="text-[10px] text-ash">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="text-sm text-white/90 leading-relaxed break-words font-mono opacity-80 group-hover:opacity-100 transition-opacity markdown-body">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 pt-0">
          {typingUsers.length > 0 && (
            <div className="px-1 mb-1 flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-ash rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-ash rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-ash rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] text-ash font-bold italic">
                {typingUsers.length === 1 
                  ? `${typingUsers[0]} is typing...` 
                  : typingUsers.length === 2 
                    ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
                    : 'Several people are typing...'}
              </span>
            </div>
          )}
          <form 
            onSubmit={sendMessage}
            className="bg-ash/40 border border-crimson/20 rounded-lg flex items-center px-4 py-2.5 focus-within:border-crimson/50 transition-all shadow-[0_0_20px_rgba(255,0,0,0.05)]"
          >
            <div className="p-1 hover:bg-white/10 rounded-full cursor-pointer mr-3 transition-colors">
              <Plus className="w-5 h-5 text-ash" />
            </div>
            <input 
              type="text" 
              value={newMessage}
              onChange={handleInputChange}
              placeholder={`Message #${activeChannel?.name || 'channel'}`}
              className="flex-1 bg-transparent border-none focus:outline-none text-sm font-mono placeholder:text-ash/60"
            />
            <div className="flex items-center gap-3 ml-3">
              <div className="p-1 hover:bg-white/10 rounded-md cursor-pointer transition-colors">
                <Download className="w-5 h-5 text-ash" />
              </div>
              <button type="submit" className="p-1 hover:bg-crimson/20 rounded-md cursor-pointer transition-colors group">
                <Send className="w-5 h-5 text-ash group-hover:text-crimson" />
              </button>
            </div>
          </form>
          <div className="mt-1.5 px-1 flex items-center gap-1">
            <span className="text-[10px] text-ash font-mono uppercase tracking-widest">GoyChat Status:</span>
            <span className="text-[10px] text-emerald-500 font-mono uppercase tracking-widest animate-pulse">Operational</span>
          </div>
        </div>
      </div>

      {/* User List Sidebar */}
      <div className="w-60 bg-ash/30 brutalist-border-l hidden xl:flex flex-col">
        <div className="h-12 px-4 flex items-center brutalist-border-b">
          <span className="text-[11px] font-bold text-ash uppercase tracking-widest">Active Users — 1</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <h3 className="text-[10px] font-bold text-ash uppercase tracking-widest mb-2 px-2">Online — 1</h3>
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-white/5 cursor-pointer group transition-colors">
              <div className="relative">
                <div className="w-8 h-8 bg-crimson rounded-full flex items-center justify-center text-[10px] font-bold border border-white/10">
                  {MOCK_USER.name.substring(0, 2)}
                </div>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-ash" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate tracking-tight group-hover:text-crimson transition-colors">{MOCK_USER.name}</div>
                <div className="text-[10px] text-ash truncate uppercase tracking-tighter">Listening to GoyChat Radio</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
