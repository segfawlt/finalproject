export interface ConversationRow {
  id: string;
  guildId: string;
  userId: string;
  status: string;
  userPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupedConversations {
  today: ConversationRow[];
  yesterday: ConversationRow[];
  earlier: ConversationRow[];
}

/**
 * Bucket conversations into Today / Yesterday / Earlier relative to `now`.
 * Conversations within each bucket stay in input order (caller should
 * pre-sort by updatedAt desc).
 */
export function groupConversationsByDate(
  conversations: ConversationRow[],
  now: Date = new Date()
): GroupedConversations {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const groups: GroupedConversations = { today: [], yesterday: [], earlier: [] };
  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    if (Number.isNaN(date.getTime())) {
      groups.earlier.push(conv);
      continue;
    }
    if (date >= todayStart) groups.today.push(conv);
    else if (date >= yesterdayStart) groups.yesterday.push(conv);
    else groups.earlier.push(conv);
  }
  return groups;
}
