export interface ReasoningMetadata {
  supportedEfforts?: string[];
  defaultEffort?: string;
  defaultEnabled?: boolean;
  mandatory?: boolean;
  supportsMaxTokens?: boolean;
  maxTokens?: number;
}

export interface StudioModel {
  id: string;
  name: string;
  description: string;
  supportsTools: boolean;
  reasoning?: ReasoningMetadata;
}

export interface ModelConfig {
  modelId: string;
  reasoning?: { effort?: string; maxTokens?: number };
}

export type ReasoningControls =
  | { kind: "unavailable" }
  | {
      kind: "effort";
      efforts: string[];
      defaultEnabled: boolean;
      defaultEffort: string | undefined;
      mandatory: boolean;
    }
  | { kind: "max-tokens"; maxTokens: number; defaultEnabled: boolean };

export function getReasoningControls(reasoning?: ReasoningMetadata): ReasoningControls {
  if (reasoning?.supportedEfforts?.length) {
    return {
      kind: "effort",
      efforts: reasoning.mandatory
        ? reasoning.supportedEfforts
        : ["off", ...reasoning.supportedEfforts],
      defaultEnabled: reasoning.defaultEnabled ?? false,
      defaultEffort: reasoning.defaultEffort,
      mandatory: reasoning.mandatory ?? false,
    };
  }
  if (reasoning?.supportsMaxTokens && reasoning.maxTokens) {
    return {
      kind: "max-tokens",
      maxTokens: reasoning.maxTokens,
      defaultEnabled: reasoning.defaultEnabled ?? false,
    };
  }
  return { kind: "unavailable" };
}

export function getDefaultModelConfig(model: StudioModel): ModelConfig {
  const controls = getReasoningControls(model.reasoning);
  if (controls.kind === "effort" && (controls.defaultEnabled || controls.mandatory)) {
    const effort = controls.defaultEffort ?? controls.efforts.find((value) => value !== "off");
    if (effort) return { modelId: model.id, reasoning: { effort } };
  }
  if (controls.kind === "max-tokens" && controls.defaultEnabled) {
    return { modelId: model.id, reasoning: { maxTokens: controls.maxTokens } };
  }
  return { modelId: model.id };
}

export function getCompactModelLabel(model: StudioModel): string {
  return model.name || model.id.split("/").pop() || model.id;
}

export function getReasoningLabel(config: ModelConfig): string {
  if (config.reasoning?.effort) {
    return `Thinking: ${capitalize(config.reasoning.effort)}`;
  }
  if (config.reasoning?.maxTokens) {
    return `Thinking: ${config.reasoning.maxTokens.toLocaleString()} tokens`;
  }
  return "Thinking off";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface ModelSelectorProps {
  models: StudioModel[];
  value: ModelConfig | null;
  onChange: (config: ModelConfig) => void;
  compact?: boolean;
}

export default function ModelSelector({
  models,
  value,
  onChange,
  compact = false,
}: ModelSelectorProps) {
  const selectedModel = models.find((model) => model.id === value?.modelId) ?? models[0];
  if (!selectedModel) return null;

  const config = value?.modelId === selectedModel.id ? value : getDefaultModelConfig(selectedModel);
  const controls = getReasoningControls(selectedModel.reasoning);
  const [openMenu, setOpenMenu] = useState<"model" | "reasoning" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputClass =
    "rounded border border-shell-border bg-shell-surface2 px-2 py-1 text-xs text-shell-text focus:border-shell-accent focus:outline-none";

  function setModel(modelId: string) {
    const model = models.find((candidate) => candidate.id === modelId);
    if (model) onChange(getDefaultModelConfig(model));
  }

  function setEffort(effort: string) {
    onChange({
      modelId: selectedModel.id,
      reasoning: effort === "off" ? undefined : { effort },
    });
  }

  function setMaxTokens(maxTokens: number) {
    onChange({ modelId: selectedModel.id, reasoning: { maxTokens } });
  }

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  if (compact) {
    return (
      <div ref={rootRef} className="flex items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}
            className="inline-flex max-w-44 items-center gap-1.5 rounded-full border border-shell-border bg-shell-surface2 px-3 py-1.5 text-xs font-medium text-shell-text transition-colors hover:border-shell-border-strong hover:bg-shell-surface3"
            aria-expanded={openMenu === "model"}
            aria-label="Select model"
          >
            <Cpu size={12} className="text-agent-thinking" />
            <span className="truncate">{getCompactModelLabel(selectedModel)}</span>
            <ChevronDown size={12} className="shrink-0 text-shell-text-subtle" />
          </button>
          {openMenu === "model" && (
            <div
              role="listbox"
              aria-label="Model choices"
              className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-shell-border bg-shell-surface p-1.5 shadow-2xl shadow-black/35"
            >
              {models.map((model) => {
                const selected = model.id === selectedModel.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setModel(model.id);
                      setOpenMenu(null);
                    }}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-shell-surface2"
                  >
                    <Cpu size={14} className="mt-0.5 shrink-0 text-agent-thinking" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-shell-text">
                        {getCompactModelLabel(model)}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-shell-text-subtle">
                        {model.id}
                      </span>
                    </span>
                    {selected && <Check size={14} className="mt-0.5 shrink-0 text-agent-done" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            disabled={controls.kind === "unavailable"}
            onClick={() => setOpenMenu(openMenu === "reasoning" ? null : "reasoning")}
            className="inline-flex items-center gap-1.5 rounded-full border border-shell-border bg-shell-surface2 px-3 py-1.5 text-xs text-shell-text-muted transition-colors hover:border-shell-border-strong hover:bg-shell-surface3 disabled:cursor-not-allowed disabled:opacity-50"
            aria-expanded={openMenu === "reasoning"}
            aria-label="Select reasoning"
          >
            <Sparkles size={12} className="text-agent-thinking" />
            <span>
              {controls.kind === "unavailable" ? "Thinking unavailable" : getReasoningLabel(config)}
            </span>
            <ChevronDown size={12} className="text-shell-text-subtle" />
          </button>
          {openMenu === "reasoning" && controls.kind === "effort" && (
            <div
              role="listbox"
              aria-label="Reasoning choices"
              className="absolute bottom-full right-0 z-30 mb-2 w-48 rounded-xl border border-shell-border bg-shell-surface p-1.5 shadow-2xl shadow-black/35"
            >
              {controls.efforts.map((effort) => {
                const selected =
                  effort === "off" ? !config.reasoning : config.reasoning?.effort === effort;
                return (
                  <button
                    key={effort}
                    type="button"
                    onClick={() => {
                      setEffort(effort);
                      setOpenMenu(null);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-shell-text transition-colors hover:bg-shell-surface2"
                  >
                    <span>{effort === "off" ? "Thinking off" : capitalize(effort)}</span>
                    {selected && <Check size={13} className="text-agent-done" />}
                  </button>
                );
              })}
            </div>
          )}
          {openMenu === "reasoning" && controls.kind === "max-tokens" && (
            <div
              role="dialog"
              aria-label="Reasoning token budget"
              className="absolute bottom-full right-0 z-30 mb-2 w-64 rounded-xl border border-shell-border bg-shell-surface p-3 shadow-2xl shadow-black/35"
            >
              <label className="block text-[11px] text-shell-text-muted">
                Thinking token budget
                <input
                  type="number"
                  min={1}
                  max={controls.maxTokens}
                  value={config.reasoning?.maxTokens ?? ""}
                  onChange={(event) => {
                    const maxTokens = Number(event.target.value);
                    if (
                      Number.isInteger(maxTokens) &&
                      maxTokens >= 1 &&
                      maxTokens <= controls.maxTokens
                    ) {
                      setMaxTokens(maxTokens);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-shell-border bg-shell-surface2 px-2.5 py-2 text-xs text-shell-text outline-none focus:border-shell-accent"
                  placeholder={`Up to ${controls.maxTokens.toLocaleString()}`}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <label className={compact ? "sr-only" : "block text-xs font-medium text-shell-text-muted"}>
        Model
      </label>
      <select
        value={selectedModel.id}
        onChange={(event) => setModel(event.target.value)}
        className={inputClass}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
      {controls.kind === "effort" && (
        <select
          value={config.reasoning?.effort ?? (controls.mandatory ? controls.defaultEffort : "off")}
          onChange={(event) => setEffort(event.target.value)}
          className={inputClass}
          aria-label="Reasoning effort"
        >
          {controls.efforts.map((effort) => (
            <option key={effort} value={effort}>
              {effort === "off" ? "Reasoning off" : `Reasoning: ${effort}`}
            </option>
          ))}
        </select>
      )}
      {controls.kind === "max-tokens" && (
        <input
          type="number"
          min={1}
          max={controls.maxTokens}
          value={config.reasoning?.maxTokens ?? ""}
          onChange={(event) => {
            const maxTokens = Number(event.target.value);
            if (Number.isInteger(maxTokens) && maxTokens >= 1 && maxTokens <= controls.maxTokens) {
              setMaxTokens(maxTokens);
            }
          }}
          className={`${inputClass} w-24`}
          aria-label="Reasoning token budget"
          placeholder={`Up to ${controls.maxTokens}`}
        />
      )}
      {controls.kind === "unavailable" && (
        <button
          type="button"
          disabled
          className="cursor-not-allowed text-xs text-shell-text-subtle disabled:opacity-100"
        >
          Reasoning unavailable
        </button>
      )}
    </div>
  );
}
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Sparkles } from "lucide-react";
