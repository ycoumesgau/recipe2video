-- Align agent_conversations defaults with app wizard / new-conversation modal.
alter table public.agent_conversations
  alter column cursor_agent_model set default 'gpt-5.5',
  alter column cursor_agent_reasoning set default 'high';
