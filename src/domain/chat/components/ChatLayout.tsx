"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Send, Settings, Paperclip, MessageSquare, Image as ImageIcon, LogOut, Trash2 } from "lucide-react";

export function ChatLayout({ session }: { session?: any }) {
  const [isTranslationOn, setIsTranslationOn] = useState(true);
  const [aiModel, setAiModel] = useState("deepseek"); 
  const [myLanguage, setMyLanguage] = useState("ko");
  const [message, setMessage] = useState("");
  const [flippedMessageId, setFlippedMessageId] = useState<string | null>(null);
  
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    
    // Fetch profile
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(async ({data, error}) => {
      if (data) {
        setProfile(data);
        if (data.preferred_language) setMyLanguage(data.preferred_language);
      } else if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, let's create it
        const newProfile = {
          id: session.user.id,
          email: session.user.email,
          full_name: session.user.email?.split('@')[0] || 'User',
          preferred_language: 'ko'
        };
        const { data: insertedProfile } = await supabase.from('profiles').insert(newProfile).select().single();
        if (insertedProfile) {
          setProfile(insertedProfile);
        }
      }
    });

    // Fetch channels
    supabase.from('channels').select('*').order('created_at').then(({data}) => {
      if (data && data.length > 0) {
        setChannels(data);
        setActiveChannel(data[0]);
      } else {
        // Create default channel if none
        supabase.from('channels').insert({ name: 'General Announcements' }).select().single().then(({data: newChan, error}) => {
           if(newChan) {
             setChannels([newChan]);
             setActiveChannel(newChan);
           } else if (error) {
             console.error("Auto-create error:", error);
             alert("Auto-create error: " + error.message);
           }
        })
      }
    });
  }, [session]);

  const translateText = async (text: string, targetLang: string, model: string) => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage: targetLang, model })
      });
      const data = await res.json();
      return data.translatedText || text;
    } catch (e) {
      return text;
    }
  };

  useEffect(() => {
    if (!activeChannel) return;

    const fetchMessages = async () => {
      const { data } = await supabase.from('messages')
        .select(`*, profiles(full_name, avatar_url)`)
        .eq('channel_id', activeChannel.id)
        .order('created_at', { ascending: true });
        
      if (data) {
        const processed = await Promise.all(data.map(async (msg) => {
          if (msg.user_id === session?.user?.id) {
             return { ...msg, translatedText: msg.original_text };
          }
          if (isTranslationOn) {
             const translated = await translateText(msg.original_text, myLanguage, aiModel);
             return { ...msg, translatedText: translated };
          }
          return { ...msg, translatedText: msg.original_text };
        }));
        setMessages(processed);
        scrollToBottom();
      }
    };

    fetchMessages();

    const channelSub = supabase.channel('messages_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannel.id}` }, async (payload) => {
        const newMsg = payload.new as any;
        const { data: userData } = await supabase.from('profiles').select('*').eq('id', newMsg.user_id).single();
        newMsg.profiles = userData;
        
        if (newMsg.user_id !== session?.user?.id && isTranslationOn) {
           newMsg.translatedText = await translateText(newMsg.original_text, myLanguage, aiModel);
        } else {
           newMsg.translatedText = newMsg.original_text;
        }
        
        setMessages(prev => [...prev, newMsg]);
        scrollToBottom();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelSub);
    };
  }, [activeChannel, myLanguage, aiModel, isTranslationOn]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !activeChannel || !session?.user?.id) return;
    
    const textToSend = message;
    setMessage("");
    
    const { error } = await supabase.from('messages').insert({
      channel_id: activeChannel.id,
      user_id: session.user.id,
      original_text: textToSend
    });
    
    if (error) {
      alert("채팅 전송 실패: " + error.message);
      console.error(error);
    }
  };

  const handleLanguageChange = async (val: string | null) => {
    if (!val) return;
    setMyLanguage(val);
    if (session?.user?.id) {
       await supabase.from('profiles').update({ preferred_language: val }).eq('id', session.user.id);
    }
  };

  const toggleMessageFlip = (id: string) => {
    setFlippedMessageId(prev => (prev === id ? null : id));
  };

  const handleCreateChannel = async () => {
    const name = window.prompt("Enter new channel name (채팅방 이름 입력):");
    if (!name || !name.trim()) return;
    const { data, error } = await supabase.from('channels').insert({ name: name.trim() }).select().single();
    if (data) {
      setChannels(prev => [...prev, data]);
      setActiveChannel(data);
    } else if (error) {
      alert("Error: " + error.message);
    }
  };

  const handleDeleteChannel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirm = window.confirm("이 채팅방을 삭제하시겠습니까? 안의 모든 메시지도 함께 삭제됩니다.");
    if (!confirm) return;
    const { error } = await supabase.from('channels').delete().eq('id', id);
    if (!error) {
      setChannels(prev => {
        const next = prev.filter(c => c.id !== id);
        if (activeChannel?.id === id) {
          setActiveChannel(next.length > 0 ? next[0] : null);
        }
        return next;
      });
    } else {
      alert("삭제 실패: " + error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="p-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-primary">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            JM's Chat
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={handleCreateChannel} title="Create Channel">
            <Plus className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="text" placeholder="Search channels..." className="pl-9 bg-background shadow-sm" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Channels
            </div>
            {channels.map((channel) => (
              <div 
                key={channel.id}
                className={`group w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${activeChannel?.id === channel.id ? 'bg-blue-100 text-blue-700 font-bold' : 'hover:bg-muted/50'}`}
              >
                <button
                  onClick={() => setActiveChannel(channel)}
                  className="flex-1 text-left truncate"
                >
                  # {channel.name}
                </button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity" 
                  onClick={(e) => handleDeleteChannel(channel.id, e)}
                  title="채팅방 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${profile?.full_name || 'U'}`} />
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.full_name || 'My Profile'}</p>
              <div className="mt-1">
                <Select value={myLanguage} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="h-6 w-[120px] text-xs bg-muted/50 border-0">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ko">Korean (한국어)</SelectItem>
                    <SelectItem value="en">English (영어)</SelectItem>
                    <SelectItem value="de">German (독일어)</SelectItem>
                    <SelectItem value="de-ch">Swiss German</SelectItem>
                    <SelectItem value="fr">French (프랑스어)</SelectItem>
                    <SelectItem value="no">Norwegian</SelectItem>
                    <SelectItem value="lb">Luxembourgish</SelectItem>
                    <SelectItem value="nl">Dutch</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="sv">Swedish</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign Out">
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950">
        <header className="h-16 px-6 border-b flex items-center justify-between shadow-sm z-10">
          <div className="flex flex-col">
            <h2 className="font-bold text-lg"># {activeChannel?.name || 'Loading...'}</h2>
            <p className="text-xs text-muted-foreground">Team Chat</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">AI Model:</span>
              <Select value={aiModel} onValueChange={(val) => val && setAiModel(val)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek (Fast/Cost)</SelectItem>
                  <SelectItem value="gpt">GPT-4o-mini (Quality)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="h-6" />

            <div className="flex items-center gap-2">
              <Switch 
                id="translation-mode" 
                checked={isTranslationOn}
                onCheckedChange={setIsTranslationOn}
              />
              <label htmlFor="translation-mode" className="text-sm font-medium cursor-pointer">
                Auto-Translate
              </label>
            </div>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6 max-w-4xl mx-auto pb-4">
            {messages.map((msg) => {
              const isMe = msg.user_id === session?.user?.id;
              return (
                <div key={msg.id} className={`flex gap-4 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  <Avatar className="w-10 h-10 border shadow-sm">
                    <AvatarImage src={msg.profiles?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.profiles?.full_name || 'U'}`} />
                    <AvatarFallback>{(msg.profiles?.full_name || 'U').charAt(0)}</AvatarFallback>
                  </Avatar>
                  
                  <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold">{msg.profiles?.full_name || 'Unknown User'}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(msg.created_at)}</span>
                    </div>
                    
                    <div 
                      onClick={() => !isMe && isTranslationOn && toggleMessageFlip(msg.id)}
                      className={`
                        relative p-3 rounded-2xl shadow-sm text-sm transition-all duration-300 ease-in-out cursor-pointer
                        ${isMe 
                          ? "bg-blue-600 text-white rounded-tr-none" 
                          : "bg-muted/30 border rounded-tl-none hover:bg-muted/50"
                        }
                      `}
                    >
                      {!isMe && isTranslationOn ? (
                        <div className="flex flex-col">
                          <span className={flippedMessageId === msg.id ? "text-muted-foreground text-xs mb-1" : "text-foreground"}>
                            {msg.translatedText || "Translating..."}
                          </span>
                          <div 
                            className={`overflow-hidden transition-all duration-300 ease-in-out ${flippedMessageId === msg.id ? "max-h-40 opacity-100 mt-2 pt-2 border-t" : "max-h-0 opacity-0"}`}
                          >
                            <p className="text-foreground italic">{msg.original_text}</p>
                            <span className="text-[10px] text-muted-foreground uppercase mt-1 block">Original</span>
                          </div>
                          {flippedMessageId !== msg.id && (
                            <div className="text-[10px] text-muted-foreground/60 text-right mt-1">Tap to see original</div>
                          )}
                        </div>
                      ) : (
                        <span>{msg.original_text}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 bg-background border-t">
          <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-muted/20 p-2 rounded-xl border shadow-sm focus-within:ring-1 focus-within:ring-primary/50 transition-all">
            <div className="flex items-center gap-1 pb-1 px-1">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-muted-foreground">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
              </Button>
            </div>
            
            <textarea
              className="flex-1 max-h-32 min-h-[40px] bg-transparent border-0 focus:ring-0 resize-none py-2.5 text-sm outline-none"
              placeholder="Type your message..."
              rows={1}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            
            <div className="pb-1 pr-1">
              <Button size="icon" onClick={handleSendMessage} className="rounded-full h-9 w-9 bg-blue-600 hover:bg-blue-700 shadow-md">
                <Send className="h-4 w-4 text-white" />
              </Button>
            </div>
          </div>
          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground">
              Auto-translating to others based on their language preferences using <span className="font-semibold text-primary">{aiModel === 'deepseek' ? 'DeepSeek' : 'GPT-4o-mini'}</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
