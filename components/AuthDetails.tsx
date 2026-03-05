
import React, { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { logOut } from "../lib/auth";
import { User } from "firebase/auth";
import Link from "next/link";
import { LogOut, UserCircle2, LogIn } from "lucide-react";

const AuthDetails = () => {
    const [authUser, setAuthUser] = useState<User | null>(null);

    useEffect(() => {
        const listen = auth.onAuthStateChanged((user) => {
            if (user) {
                setAuthUser(user);
            } else {
                setAuthUser(null);
            }
        });

        return () => {
            listen();
        };
    }, []);

    return (
        <div className="absolute top-4 right-4 text-right z-50">
            {authUser ? (
                <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/20 px-4 py-3 min-w-[200px]">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="flex-shrink-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <UserCircle2 className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500 font-medium">Signed in as</p>
                            <p className="text-sm text-slate-800 font-semibold truncate">
                                {authUser.email}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={logOut}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl font-medium text-sm hover:from-red-600 hover:to-pink-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 cursor-pointer"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            ) : (
                <Link 
                    href="/login" 
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-semibold text-sm shadow-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 hover:shadow-xl transform hover:-translate-y-0.5 border border-white/20 backdrop-blur-md"
                >
                    <LogIn className="w-4 h-4" />
                    Sign In
                </Link>
            )}
        </div>
    );
};

export default AuthDetails;
