/** 選択中アカウントに絞る。all のときは NULL 行も含める。 */
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
  return { clause: "1 = 1", args: [] };
}
