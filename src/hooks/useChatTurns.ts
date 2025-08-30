import { useMemo, useState, useEffect } from 'react';
import { Message } from '@/types/chat';

export type Turn = { user?: Message & { assistantVariants?: string[] }; assistants: Message[] };

export function useChatTurns(messages: Message[]) {
  // Group messages into conversation turns (user + assistant variants)
  const turns: Turn[] = useMemo(() => {
    // Group assistant messages by their parent user via parentUserId when available.
    const result: Turn[] = [];
    const userIdToTurnIndex = new Map<string, number>();
    let lastUserTurnIndex: number | null = null;

    messages.forEach((msg) => {
      if (msg.role === 'user') {
        // Start a new turn for this user
        result.push({ user: msg as Turn['user'], assistants: [] });
        const idx = result.length - 1;
        userIdToTurnIndex.set(msg.id, idx);
        lastUserTurnIndex = idx;
      } else {
        // Assistant: try to find its user via parentUserId; fallback to last user turn
        let targetIdx: number | null = null;
        if ((msg as any).parentUserId && userIdToTurnIndex.has((msg as any).parentUserId)) {
          targetIdx = userIdToTurnIndex.get((msg as any).parentUserId)!;
        } else {
          targetIdx = lastUserTurnIndex;
        }
        if (targetIdx === null) {
          // No user yet; start a turn without user
          result.push({ assistants: [msg] });
        } else {
          result[targetIdx].assistants.push(msg);
        }
      }
    });

    return result;
  }, [messages]);

  // Track selected assistant variant per turn
  const [turnVariantIndex, setTurnVariantIndex] = useState<Record<string, number>>({});
  
  const getTurnKey = (turn: Turn, idx: number) => turn.user?.id || `turn_${idx}`;

  // Build a lightweight signature so we only react to meaningful changes
  const turnsSignature = useMemo(
    () =>
      turns
        .map((t, idx) => `${t.user?.id || `u${idx}`}:${t.assistants.map(a => a.id).join(',')}`)
        .join('|'),
    [turns]
  );

  // Ensure a default selection for any turn lacking one, and prune removed turns
  useEffect(() => {
    setTurnVariantIndex(prev => {
      let changed = false;
      const next = { ...prev } as Record<string, number>;

      // Add defaults / fix out-of-range selections
      turns.forEach((turn, idx) => {
        const key = getTurnKey(turn, idx);
        const total = turn.assistants.length;
        if (total > 0) {
          const current = next[key];
          const desired = current === undefined || current >= total ? total - 1 : current;
          if (current !== desired) {
            next[key] = desired;
            changed = true;
          }
        }
      });

      // Prune selections for removed turns
      Object.keys(next).forEach(k => {
        const exists = turns.some((turn, idx) => getTurnKey(turn, idx) === k);
        if (!exists) {
          delete next[k];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [turnsSignature]);

  const handleVariantPrev = (turnKey: string, total: number) => {
    setTurnVariantIndex(prev => {
      const current = prev[turnKey] ?? 0;
      const next = (current - 1 + total) % total;
      return { ...prev, [turnKey]: next };
    });
  };

  const handleVariantNext = (turnKey: string, total: number) => {
    setTurnVariantIndex(prev => {
      const current = prev[turnKey] ?? 0;
      const next = (current + 1) % total;
      return { ...prev, [turnKey]: next };
    });
  };

  return {
    turns,
    turnVariantIndex,
    getTurnKey,
    handleVariantPrev,
    handleVariantNext
  };
}
