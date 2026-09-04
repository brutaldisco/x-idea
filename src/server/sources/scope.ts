/** 選択中アカウントに絞る。未選択なら 0 件。混ぜない。 */
export function sourceScopeSql(
  accountId: string | null,
  alias = "",
): {
  clause: string;
  args: string[];
} {
  const col = alias ? `${alias}.x_account_id` : "x_account_id";
  if (accountId) {
    return { clause: `${col} = ?`, args: [accountId] };
  }
  return { clause: "1 = 0", args: [] };
}
