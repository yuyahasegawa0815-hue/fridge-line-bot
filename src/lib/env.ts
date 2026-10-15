function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

export const env = {
  lineChannelSecret: () => required("LINE_CHANNEL_SECRET"),
  lineChannelAccessToken: () => required("LINE_CHANNEL_ACCESS_TOKEN"),
  lineLoginChannelId: () => required("LINE_LOGIN_CHANNEL_ID"),
  liffId: () => required("NEXT_PUBLIC_LIFF_ID"),
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
};
