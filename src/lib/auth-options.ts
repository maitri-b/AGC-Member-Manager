// NextAuth Configuration with LINE Provider
import { NextAuthOptions } from 'next-auth';
import type { Provider } from 'next-auth/providers/index';
import { adminDb } from './firebase-admin';
import { ROLE_PERMISSIONS, UserRole } from '@/types/next-auth.d';

// Custom LINE Provider that handles HS256 JWT algorithm issue
// LINE uses HS256 for ID tokens but openid-client expects RS256
const LineProvider = {
  id: 'line',
  name: 'LINE',
  type: 'oauth' as const,
  authorization: {
    url: 'https://access.line.me/oauth2/v2.1/authorize',
    params: {
      scope: 'profile openid',
      response_type: 'code',
    },
  },
  // Custom token endpoint handler to bypass ID token validation
  token: {
    url: 'https://api.line.me/oauth2/v2.1/token',
    async request({ client, params, checks, provider }: {
      client: { client_id: string };
      params: { code?: string; redirect_uri?: string };
      checks: { state?: { value: string } };
      provider: { callbackUrl: string; clientId?: string; clientSecret?: string };
    }) {
      const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: params.code || '',
          redirect_uri: provider.callbackUrl,
          client_id: provider.clientId || '',
          client_secret: provider.clientSecret || '',
        }),
      });

      const tokens = await response.json();
      return { tokens };
    },
  },
  userinfo: {
    url: 'https://api.line.me/v2/profile',
    async request({ tokens }: { tokens: { access_token?: string } }) {
      const response = await fetch('https://api.line.me/v2/profile', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      return await response.json();
    },
  },
  clientId: process.env.LINE_CHANNEL_ID,
  clientSecret: process.env.LINE_CHANNEL_SECRET,
  profile(profile: {
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
  }) {
    return {
      id: profile.userId,
      name: profile.displayName,
      email: null,
      image: profile.pictureUrl ?? null,
      lineUserId: profile.userId,
      role: 'guest' as UserRole,
      permissions: [],
    };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authOptions: NextAuthOptions = {
  providers: [LineProvider as any],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'line') {
        try {
          const db = adminDb();
          const userRef = db.collection('users').doc(user.id);
          const userDoc = await userRef.get();

          // Log user data for debugging
          console.log('LINE signIn - User data:', {
            id: user.id,
            name: user.name,
            image: user.image,
            email: user.email,
          });

          if (!userDoc.exists) {
            // Create new user document
            await userRef.set({
              lineUserId: user.id,
              displayName: user.name || null,
              pictureUrl: user.image || null,
              email: user.email || null,
              role: 'guest',
              permissions: ROLE_PERMISSIONS.guest,
              memberId: null,
              isActive: true,
              createdAt: new Date(),
              lastLoginAt: new Date(),
            });
          } else {
            // Update last login and profile info if available
            const updateData: Record<string, unknown> = {
              lastLoginAt: new Date(),
            };

            // Only update displayName if we have a value and current is empty
            const existingData = userDoc.data();
            if (user.name && (!existingData?.displayName || existingData.displayName === null)) {
              updateData.displayName = user.name;
            }
            if (user.image && (!existingData?.pictureUrl || existingData.pictureUrl === null)) {
              updateData.pictureUrl = user.image;
            }
            // Always update lineUserId to ensure it's set
            if (!existingData?.lineUserId) {
              updateData.lineUserId = user.id;
            }

            await userRef.update(updateData);
          }
          return true;
        } catch (error) {
          console.error('Error saving user to Firestore:', error);
          return true; // Still allow sign in even if Firestore fails
        }
      }
      return true;
    },

    async jwt({ token, user, account }) {
      // On initial sign in, set the lineUserId and accessToken
      if (account && user) {
        token.lineUserId = user.id;
        token.accessToken = account.access_token;
      }

      // Always fetch latest role/permissions from Firestore
      // This ensures changes made by admin (like verification approval) are reflected immediately
      const userId = token.lineUserId || token.sub;
      if (userId) {
        try {
          const db = adminDb();
          const userDoc = await db.collection('users').doc(userId).get();

          if (userDoc.exists) {
            const userData = userDoc.data();
            const role = (userData?.role as UserRole) || 'guest';
            token.role = role;
            token.memberId = userData?.memberId;
            // Always use ROLE_PERMISSIONS based on current role
            // This ensures permissions are always in sync with the role
            token.permissions = ROLE_PERMISSIONS[role] || [];
          } else {
            token.role = 'guest';
            token.memberId = undefined;
            token.permissions = ROLE_PERMISSIONS.guest;
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          // Keep existing values on error, don't downgrade to guest
          if (!token.role) {
            token.role = 'guest';
            token.permissions = ROLE_PERMISSIONS.guest;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.lineUserId = token.lineUserId;
        session.user.role = token.role;
        session.user.memberId = token.memberId;
        session.user.permissions = token.permissions;
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
};
