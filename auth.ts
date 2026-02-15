import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      // You can specify which fields should be submitted, by adding keys to the `credentials` object.
      // e.g. domain, username, password, 2FA token, etc.
      credentials: {
        email: { label: "email", type: "text" },
        password: { label: "password", type: "password" },
      },

      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const user = await prisma.user.findUnique({
            where: {
              email: credentials.email,
            },
            select: {
              id: true,
              first_name: true,
              last_name: true,
              role: true,
              password: true,
              email: true,
            },
          });


          if (user) {
            const passwordCorrect = bcrypt.compareSync(
              credentials.password,
              user.password
            );
            if (passwordCorrect) {
              return user;
            }
          }
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }

        return null;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "credentials" && user) {
        token.id = user.id;
        token.first_name = user.first_name;
        token.last_name = user.last_name;
        token.role = user.role;
      }
      return token;
    },

    async session({ session, token }) {
      // console.log(session, token);
      // const now = new Date();

      if (session.user) {
        session.user.id = token.id;
        session.user.first_name = token.first_name;
        session.user.last_name = token.last_name;
        session.user.role = token.role;
        
      }

      // if (new Date(session.expires) < new Date('2026-09-22T20:54:41.484Z')) {
      //   return null; // หมดอายุ
      // }

      return session;
    },
  },

  secret: process.env.AUTH_SECRET,
});
