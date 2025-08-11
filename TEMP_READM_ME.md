Temporary Progress Log (Frontend Optimization)

This document tracks progressive refactoring of the `src` (frontend) to improve structure, readability, maintainability, and performance while preserving backend interactions and app functionality.

Phase 1: Introduce API Client and Service Layer
- Added `src/lib/apiClient.ts`
  - Centralizes fetch logic: timeouts, headers, error handling.
- Added `src/services/chatService.ts`
  - Provides typed wrappers for chat-related backend calls via Next API routes.

Benefits:
- Removes duplicated fetch code across components.
- Uniform error handling and timeouts.
- Easier to stub/migrate in future.

Phase 2: Component Refactor (ChatHistory)
- Updated `src/components/ChatHistory.tsx` to use `chatService` instead of inline `fetch` calls for:
  - Listing chats
  - Creating a chat
  - Getting chat details
  - Updating chat title
  - Deleting chat
  - Listing models
- Removed unused imports and simplified date-fns usage.

Result:
- Smaller component surface for networking concerns.
- Clear separation of concerns.

Phase 3: Shared Event Emitter + Type Consolidation
- Added `src/lib/events.ts`; refactored `src/lib/ChatInstance.ts` and `src/lib/ChatListManager.ts` to use it.
- Centralized `ChatListItem` and event types in `src/types/chat.ts`; updated imports in components and hooks.
- Replaced inline fetch calls in `ChatListManager` with `chatService`.

Phase 4: ChatbotPanel modularization (start)
- Extracted header and context controls into `src/components/chat/ChatHeader.tsx` and `src/components/chat/ContextControls.tsx`.
- Updated `src/components/ChatbotPanel.tsx` to consume these subcomponents.

Next Planned Phases
1. Folder-by-Folder structure proposal and incremental edits:
   - `src/lib`: dedupe and formalize `ChatInstance`/persistence utilities; extract event emitter.
   - `src/hooks`: split large hooks into smaller modules (state, effects, api).
   - `src/components`: continue breaking down `ChatbotPanel` (message item, list, input/composer, feedback widgets).
   - `src/app/api`: keep proxy contract stable; move shared constants to a small util.
   - `src/lib/api`: consolidated `client` and `chatService` under `src/lib/api/*` and updated imports.
2. Remove dead code/types and align type imports from a central `src/types` directory.
3. Add lightweight tests for services and hooks where feasible.

Validation Checklist (each phase)
- App compiles and `npm run dev` works.
- Chat create/list/select/delete flows function.
- Model listing still works; degraded gracefully when backend is offline.

If we stop mid-way: resume from Next Planned Phases, step 1.
