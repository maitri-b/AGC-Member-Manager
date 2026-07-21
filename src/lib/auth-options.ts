// NextAuth Configuration with LINE Provider
import { NextAuthOptions } from 'next-auth';
import type { Provider } from 'next-auth/providers/index';
import { JWT } from 'next-auth/jwt';
import { adminDb } from './firebase-admin';
import { ROLE_PERMISSIONS, UserRole } from '@/types/next-auth.d';
import { updateMember, getMemberById } from './google-sheets';
import { getEffectivePermissions } from './permissions';

/**
 * Refresh LINE Access Token using Refresh Token
 * This allows us to keep users logged in and get updated profile data
 * without requiring them to re-authenticate
 */
async function refreshLineAccessToken(token: JWT): Promise<JWT> {
  try {
    console.log('[LINE Token Refresh] Starting refresh process...');

    const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
        client_id: process.env.LINE_CHANNEL_ID || '',
        client_secret: process.env.LINE_CHANNEL_SECRET || '',
      }),
    });

    if (!response.ok) {
      console.error('[LINE Token Refresh] Failed:', response.status, response.statusText);
      throw new Error('Failed to refresh LINE access token');
    }

    const refreshedTokens = await response.json();
    console.log('[LINE Token Refresh] Success - got new tokens');

    // Fetch updated profile data from LINE
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: {
        Authorization: `Bearer ${refreshedTokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      console.error('[LINE Token Refresh] Profile fetch failed:', profileResponse.status);
      throw new Error('Failed to fetch LINE profile');
    }

    const profile = await profileResponse.json();
    console.log('[LINE Token Refresh] Profile updated:', {
      displayName: profile.displayName,
      hasImage: !!profile.pictureUrl,
    });

    // Update Firestore with latest profile data
    try {
      const db = adminDb();
      const userId = token.lineUserId || token.sub;
      if (userId) {
        await db.collection('users').doc(userId as string).update({
          lineDisplayName: profile.displayName,
          lineProfilePicture: profile.pictureUrl || null,
          lastProfileRefresh: new Date(),
        });
        console.log('[LINE Token Refresh] Firestore updated');
      }
    } catch (firestoreError) {
      console.error('[LINE Token Refresh] Firestore update failed:', firestoreError);
      // Don't fail the refresh if Firestore update fails
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken, // Fall back to old refresh token if not provided
      accessTokenExpires: Date.now() + (refreshedTokens.expires_in * 1000),
      lineDisplayName: profile.displayName,
      lineProfilePicture: profile.pictureUrl || null,
      error: undefined, // Clear any previous errors
    };
  } catch (error) {
    console.error('[LINE Token Refresh] Error:', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

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
      console.log('[LINE OAuth] Received tokens:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });
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
          console.log('=== LINE signIn callback triggered ===');
          console.log('LINE signIn - User data:', {
            id: user.id,
            name: user.name,
            image: user.image,
            email: user.email,
            timestamp: new Date().toISOString(),
          });

          if (!userDoc.exists) {
            // Create new user document
            await userRef.set({
              lineUserId: user.id,
              lineDisplayName: user.name || null,
              lineProfilePicture: user.image || null,
              email: user.email || null,
              role: 'guest',
              permissions: ROLE_PERMISSIONS.guest,
              memberId: null,
              isActive: true,
              assignedEventIds: [],
              createdAt: new Date(),
              lastLoginAt: new Date(),
            });
          } else {
            // Update last login and profile info if available
            const updateData: Record<string, unknown> = {
              lastLoginAt: new Date(),
            };

            // Always update LINE profile from latest login data
            // This ensures profile changes (name, picture) are synced on every login
            const existingData = userDoc.data();
            if (user.name) {
              updateData.lineDisplayName = user.name;
            }
            if (user.image) {
              updateData.lineProfilePicture = user.image;
            }
            // Always update lineUserId to ensure it's set
            if (!existingData?.lineUserId) {
              updateData.lineUserId = user.id;
            }

            console.log('LINE signIn - Updating user with:', updateData);
            await userRef.update(updateData);
            console.log('LINE signIn - User updated successfully');

            // Also update Google Sheet if user has memberId
            if (existingData?.memberId && user.name) {
              try {
                console.log('LINE signIn - Updating Google Sheet for memberId:', existingData.memberId);
                await updateMember(existingData.memberId, {
                  lineDisplayName: user.name,
                  lastUpdated: new Date().toISOString(),
                  updatedBy: 'LINE_LOGIN_SYNC',
                });
                console.log('LINE signIn - Google Sheet updated successfully');
              } catch (sheetError) {
                // Don't fail login if sheet update fails
                console.error('Error updating Google Sheet:', sheetError);
              }
            }
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
      // On initial sign in, capture all tokens and set expiry
      if (account && user) {
        console.log('[JWT Callback] Initial sign in - storing tokens');
        token.lineUserId = user.id;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + (30 * 24 * 60 * 60 * 1000); // Default: 30 days
        token.lineDisplayName = user.name || undefined;
        token.lineProfilePicture = user.image || undefined;
      }

      // Check if access token needs refresh (refresh 1 hour before expiry)
      const shouldRefresh = token.accessTokenExpires && Date.now() > (token.accessTokenExpires as number) - (60 * 60 * 1000);

      if (shouldRefresh && token.refreshToken) {
        console.log('[JWT Callback] Token expiring soon, refreshing...');
        token = await refreshLineAccessToken(token);
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
            const memberId = userData?.memberId;
            const isActive = userData?.isActive;
            const assignedEventIds = userData?.assignedEventIds || [];

            token.role = role;
            token.memberId = memberId;
            token.assignedEventIds = assignedEventIds;

            // Fetch member status from Google Sheets if memberId exists
            let memberStatus: string | undefined;
            let lineGroupStatus: string | undefined;

            if (memberId) {
              try {
                const memberData = await getMemberById(memberId);
                if (memberData) {
                  memberStatus = memberData.status;
                  lineGroupStatus = memberData.lineGroupStatus;
                }
              } catch (error) {
                console.error('Error fetching member data from Google Sheets:', error);
                // Continue without member status - will use default permissions
              }
            }

            // Calculate effective permissions based on role and member status
            token.permissions = getEffectivePermissions(
              role,
              isActive,
              memberStatus,
              lineGroupStatus
            );
          } else {
            token.role = 'guest';
            token.memberId = undefined;
            token.assignedEventIds = [];
            token.permissions = ROLE_PERMISSIONS.guest;
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          // Keep existing values on error, don't downgrade to guest
          if (!token.role) {
            token.role = 'guest';
            token.assignedEventIds = [];
            token.permissions = ROLE_PERMISSIONS.guest;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // Use lineUserId as the primary user ID (token.sub may be undefined in some cases)
        session.user.id = (token.lineUserId || token.sub) as string;
        session.user.lineUserId = token.lineUserId;
        session.user.role = token.role;
        session.user.memberId = token.memberId;
        session.user.permissions = token.permissions;
        session.user.assignedEventIds = token.assignedEventIds;
        session.accessToken = token.accessToken;

        // Include updated profile data from token
        if (token.lineDisplayName) {
          session.user.name = token.lineDisplayName as string;
        }
        if (token.lineProfilePicture) {
          session.user.image = token.lineProfilePicture as string;
        }

        // If token refresh failed, add error to session
        if (token.error) {
          session.error = token.error as string;
        }
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
    maxAge: 7 * 24 * 60 * 60, // 7 days - shorter to ensure profile data stays fresh
    updateAge: 24 * 60 * 60, // Update session every 24 hours to trigger token refresh check
  },

  secret: process.env.NEXTAUTH_SECRET,
};
