import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    uid: string;
    role: string;
    gkCookie: string;
    csrf: string;
  }
  interface Session {
    user: { id: string; email?: string | null; role: string };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    uid: string;
    role: string;
    gkCookie: string;
    csrf: string;
  }
}
