import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaClient } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "email", type: "text" },
        password: { label: "password", type: "password" },
      },

      // ✅ FIX: authorize ต้องรับ (credentials, request)
      authorize: async (credentials, _req) => {
        const email = String(credentials?.email ?? "").trim();
        const password = String(credentials?.password ?? "");

        if (!email || !password) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              first_name: true,
              last_name: true,
              role: true,
              password: true,
              email: true,
            },
          });

          if (!user) return null;

          const passwordCorrect = bcrypt.compareSync(password, user.password);
          if (!passwordCorrect) return null;

          // ✅ FIX: ห้ามส่ง password กลับ + ต้องให้ id เป็น string ตาม type ของ NextAuth
          return {
            id: String(user.id),
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
          } as any;
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "credentials" && user) {
        // ✅ FIX: user.id เป็น string แล้ว
        token.id = (user as any).id;
        token.first_name = (user as any).first_name;
        token.last_name = (user as any).last_name;
        token.role = (user as any).role;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).first_name = token.first_name;
        (session.user as any).last_name = token.last_name;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },

  secret: process.env.AUTH_SECRET,
});
