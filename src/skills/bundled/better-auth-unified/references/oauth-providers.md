# OAuth Providers

Guide for configuring social OAuth providers with Better Auth.

## Built-in Providers

Better Auth supports many OAuth providers out of the box. Configure them in `socialProviders`:

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
  },
});
```

## Supported Providers

| Provider | Config Key | Env Vars Needed |
|----------|-----------|-----------------|
| Google | `google` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | `github` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Apple | `apple` | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` |
| Microsoft | `microsoft` | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |
| Discord | `discord` | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` |
| Twitter/X | `twitter` | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` |
| Facebook | `facebook` | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` |
| Spotify | `spotify` | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| Twitch | `twitch` | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| LinkedIn | `linkedin` | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| Dropbox | `dropbox` | `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET` |

## Client-Side OAuth Sign-In

```ts
// Redirect to provider
await authClient.signIn.social({
  provider: "github",
  callbackURL: "https://example.com/dashboard", // Where to redirect after auth
});
```

## Account Linking

Allow users to link multiple OAuth providers to one account:

```ts
export const auth = betterAuth({
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"], // Providers that auto-link by email
    },
  },
});
```

## Generic OAuth

For providers not built in, use the `genericOAuth` plugin:

```ts
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    genericOAuth({
      config: [{
        providerId: "custom-provider",
        clientId: process.env.CUSTOM_CLIENT_ID!,
        clientSecret: process.env.CUSTOM_CLIENT_SECRET!,
        authorizationUrl: "https://provider.com/oauth/authorize",
        tokenUrl: "https://provider.com/oauth/token",
        userInfoUrl: "https://provider.com/api/user",
      }],
    }),
  ],
});
```

## OAuth Setup Checklist

- [ ] Register your app with each provider's developer console
- [ ] Set redirect URI to `{BETTER_AUTH_URL}/api/auth/callback/{provider}`
- [ ] Add client ID and secret to environment variables
- [ ] Configure `socialProviders` in auth config
- [ ] Test the complete OAuth flow (sign in, callback, session creation)
- [ ] Review `account.accountLinking` settings
