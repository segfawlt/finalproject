import { useState } from "react";
import { ArrowUp, Loader } from "lucide-react";
import ModelSelector, { type ModelConfig, type StudioModel } from "./ModelSelector";
import BorderBeam from "../ui/border-beam";

interface SharedComposerProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (prompt: string) => void | Promise<void>;
  placeholder: string;
  submitLabel: string;
  inFlight: boolean;
  models: StudioModel[];
  modelConfig: ModelConfig | null;
  modelsLoading: boolean;
  onModelChange: (config: ModelConfig) => void | Promise<void>;
  active?: boolean;
  clearAfterSubmit?: boolean;
}

export default function SharedComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
  inFlight,
  models,
  modelConfig,
  modelsLoading,
  onModelChange,
  active = false,
  clearAfterSubmit = false,
}: SharedComposerProps) {
  const [draft, setDraft] = useState(value ?? "");

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-shell-canvas via-shell-canvas/95 to-transparent px-8 pb-5 pt-16">
      <BorderBeam active={active} borderRadius={24}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const prompt = draft.trim();
            if (!prompt || inFlight) return;
            onChange?.(prompt);
            if (clearAfterSubmit) setDraft("");
            void onSubmit(prompt);
          }}
          className="pointer-events-auto mx-auto max-w-4xl rounded-3xl border border-shell-border bg-[#101010] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder={placeholder}
            className="w-full resize-none rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-shell-text focus:outline-none focus:ring-0"
          />
          <div className="flex items-center gap-2 border-t border-shell-border/70 px-2 pt-2">
            {modelsLoading ? (
              <span className="text-[11px] text-shell-text-subtle">Loading model...</span>
            ) : (
              <ModelSelector models={models} value={modelConfig} onChange={onModelChange} compact />
            )}
            <span className="flex-1 text-[11px] text-shell-text-subtle">
              Takes effect on the next turn.
            </span>
            <button
              type="submit"
              disabled={!draft.trim() || inFlight}
              aria-label={submitLabel}
              title={submitLabel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shell-surface3 text-shell-text transition-colors hover:bg-shell-border-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {inFlight ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <ArrowUp size={16} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </form>
      </BorderBeam>
    </div>
  );
}
