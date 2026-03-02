
import React, { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { logOut } from "../lib/auth";
import { User } from "firebase/auth";
import Link from "next/link";

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
                <div className="flex flex-col items-end space-y-1">
                    <p className="text-sm text-slate-700 font-light">
                        Signed in as <span className="font-medium">{authUser.email}</span>
                    </p>
                    <button
                        onClick={logOut}
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                        Sign Out
                    </button>
                </div>
            ) : (
                <Link href="/login" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                    Sign In
                </Link>
            )}
        </div>
    );
};

export default AuthDetails;
