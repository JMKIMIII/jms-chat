"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    // Workaround for Supabase Auth which requires email:
    const fakeEmail = `${username.toLowerCase().trim()}@jmschat.com`;

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
        if (error) {
           if (error.message.includes("Invalid login")) {
              throw new Error("Invalid ID or Password.");
           }
           throw error;
        }
      } else {
        const { error: signUpError, data } = await supabase.auth.signUp({ email: fakeEmail, password });
        if (signUpError) {
            if (signUpError.message.includes("already registered")) {
                throw new Error("This ID is already taken.");
            }
            throw signUpError;
        }
        
        // Auto create profile on signup
        if (data.user) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            email: fakeEmail,
            full_name: username,
            preferred_language: 'ko'
          });
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30">
        <Card className="w-[400px]">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <MessageSquare className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <CardTitle>JM's Chat</CardTitle>
            <CardDescription>
              {isLogin ? "Sign in with your ID" : "Create a new ID"}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleAuth}>
            <CardContent className="space-y-4">
              {error && <div className="text-sm text-red-500 text-center font-medium bg-red-50 p-2 rounded">{error}</div>}
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="ID (아이디)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Password (비밀번호)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {!isLogin && (
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Confirm Password (비밀번호 확인)"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? "Please wait..." : (isLogin ? "Sign In" : "Sign Up")}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => {
                   setIsLogin(!isLogin);
                   setError("");
                   setConfirmPassword("");
                }}
              >
                {isLogin ? "Don't have an ID? Sign up" : "Already have an ID? Sign in"}
              </button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <React.Fragment>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { session } as any);
        }
        return child;
      })}
    </React.Fragment>
  );
}
