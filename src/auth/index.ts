import 'server-only';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { env } from '@/lib/env';
import { upsertUserOnLogin } from '@/db/users';
import { gatekeeperLogin } from './gatekeeper';

// CredentialsSignin subclasses are not wrapped by Auth.js, so `.code` reaches the login action.
class OtpRequiredError extends CredentialsSignin {
  code = 'OTP_REQUIRED';
}
class OtpInvalidError extends CredentialsSignin {
  code = 'OTP_INVALID';
}
class ServiceUnavailableError extends CredentialsSignin {
  code = 'SERVICE_ERROR';
}
class InactiveAccountError extends CredentialsSignin {
  code = 'INACTIVE';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  // Gatekeeper sessions are short-lived; a dead one is detected on the next backend call.
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, otp: {} },
      authorize: async (creds) => {
        const email = String(creds?.email ?? '');
        const password = String(creds?.password ?? '');
        const otp = creds?.otp ? String(creds.otp) : undefined;
        if (!email || !password) return null;

        const r = await gatekeeperLogin({ email, password, otp });
        if (!r.ok) {
          if (r.code === 'OTP_REQUIRED') throw new OtpRequiredError();
          if (r.code === 'OTP_INVALID') throw new OtpInvalidError();
          if (r.code === 'SERVICE_ERROR') throw new ServiceUnavailableError();
          return null;
        }
        if (r.user.state !== 'active') throw new InactiveAccountError();

        let local: { id: string };
        try {
          local = await upsertUserOnLogin({
            gatekeeperUid: r.user.uid,
            email: r.user.email,
            gatekeeperRole: r.user.role,
          });
        } catch (e) {
          console.error('[auth] user upsert failed:', e instanceof Error ? e.message : e);
          throw new ServiceUnavailableError();
        }

        return {
          id: local.id,
          email: r.user.email,
          uid: r.user.uid,
          role: r.user.role,
          gkCookie: r.gkCookie,
          csrf: r.csrf,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id!;
        token.uid = user.uid;
        token.role = user.role;
        token.gkCookie = user.gkCookie;
        token.csrf = user.csrf;
      }
      return token;
    },
    session({ session, token }) {
      // Only safe fields reach the browser; gkCookie/csrf stay inside the encrypted JWT.
      session.user.id = token.userId;
      session.user.role = token.role;
      return session;
    },
  },
});
