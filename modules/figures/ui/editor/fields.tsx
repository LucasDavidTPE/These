/** Champs de formulaire générés depuis le schéma des paramètres (src/core/schema/params.ts). */
import { useState } from "react";
import { formatPoints, parsePoints } from "../../core/editor";
import type { ParamSchema, ParamSpec, Pt } from "../../core/schema";

/** Nombre saisi avec virgule ou point ; validé à la sortie du champ ou sur Entrée. */
export function NumberInput(props: { value: number | undefined; onChange: (v: number) => void; step?: number; title?: string }) {
  const fmt = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));
  const [text, setText] = useState(fmt(props.value));
  // Resynchronise le champ quand la valeur change ailleurs (annuler, glisser…).
  const [seen, setSeen] = useState(props.value);
  if (seen !== props.value) {
    setSeen(props.value);
    setText(fmt(props.value));
  }
  const commitText = () => {
    const v = Number(text.replace(",", ".").trim());
    if (text.trim() !== "" && Number.isFinite(v)) {
      if (v !== props.value) props.onChange(v);
    } else setText(props.value === undefined ? "" : String(props.value).replace(".", ","));
  };
  return (
    <input
      className="num"
      value={text}
      title={props.title}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commitText}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitText();
      }}
    />
  );
}

/** Texte validé à la sortie du champ (évite une entrée d'historique par frappe). */
export function TextInput(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(props.value);
  const [seen, setSeen] = useState(props.value);
  if (seen !== props.value) {
    setSeen(props.value);
    setText(props.value);
  }
  const commitText = () => {
    if (text !== props.value) props.onChange(text);
  };
  return (
    <input
      value={text}
      placeholder={props.placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commitText}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitText();
      }}
    />
  );
}

function parseNumbers(text: string): number[] | null {
  const parts = text.split(/[;\s]+/).filter(Boolean).map((t) => Number(t.replace(",", ".")));
  return parts.every(Number.isFinite) ? parts : null;
}

export function ParamField(props: { spec: ParamSpec & { optional?: boolean }; value: unknown; onChange: (v: unknown) => void }) {
  const { spec, value, onChange } = props;
  const label = (
    <span>
      {spec.label}
      {"unit" in spec && spec.unit ? ` (${spec.unit})` : ""}
    </span>
  );
  switch (spec.kind) {
    case "number":
      return (
        <label className="field">
          {label}
          <NumberInput value={value as number | undefined} onChange={onChange} />
        </label>
      );
    case "string":
      return (
        <label className="field">
          {label}
          <TextInput value={(value as string | undefined) ?? ""} onChange={(v) => onChange(spec.optional && v === "" ? undefined : v)} placeholder={spec.math ? "$…$ pour les maths" : undefined} />
        </label>
      );
    case "boolean":
      return (
        <label className="chip">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {spec.label}
        </label>
      );
    case "enum":
      return (
        <label className="field">
          {label}
          <select value={value as string} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "numbers":
      return (
        <label className="field">
          {label}
          <TextInput
            value={((value as number[] | undefined) ?? []).map((n) => String(n).replace(".", ",")).join(" ; ")}
            onChange={(t) => {
              const nums = parseNumbers(t);
              if (nums) onChange(nums);
            }}
            placeholder="valeurs séparées par ;"
          />
        </label>
      );
    case "points":
      return (
        <label className="field">
          {label}
          <TextInput
            value={formatPoints((value as Pt[] | undefined) ?? [])}
            onChange={(t) => {
              const pts = parsePoints(t);
              if (pts && pts.length >= (spec.minItems ?? 0)) onChange(pts);
            }}
            placeholder="x y ; x y ; …"
          />
        </label>
      );
    case "group": {
      const v = (value as Record<string, unknown>) ?? {};
      return (
        <fieldset className="list-field">
          <legend>{spec.label}</legend>
          {Object.entries(spec.fields).map(([k, s]) => (
            <ParamField key={k} spec={s} value={v[k]} onChange={(nv) => onChange({ ...v, [k]: nv })} />
          ))}
        </fieldset>
      );
    }
    case "list":
      return <ListField spec={spec} value={(value as Record<string, unknown>[]) ?? []} onChange={onChange} />;
  }
}

function ListField(props: { spec: Extract<ParamSpec, { kind: "list" }>; value: Record<string, unknown>[]; onChange: (v: unknown) => void }) {
  const { spec, value, onChange } = props;
  const set = (i: number, key: string, v: unknown) => {
    const next = value.map((row, j) => {
      if (j !== i) return row;
      const r = { ...row };
      if (v === undefined) delete r[key];
      else r[key] = v;
      return r;
    });
    onChange(next);
  };
  const defaults = () => Object.fromEntries(Object.entries(spec.item).filter(([, s]) => !s.optional).map(([k, s]) => [k, structuredClone(s.default)]));
  const move = (i: number, d: number) => {
    const next = [...value];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row!);
    onChange(next);
  };
  return (
    <fieldset className="list-field">
      <legend>{spec.label}</legend>
      {value.map((row, i) => (
        <div key={i} className="list-row">
          <div className="list-row-head">
            <b>{i + 1}</b>
            <span className="grow" />
            <button type="button" className="small-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Monter">
              ↑
            </button>
            <button type="button" className="small-btn" disabled={i === value.length - 1} onClick={() => move(i, 1)} title="Descendre">
              ↓
            </button>
            <button type="button" className="small-btn" disabled={value.length <= (spec.minItems ?? 0)} onClick={() => onChange(value.filter((_, j) => j !== i))} title="Supprimer">
              ✕
            </button>
          </div>
          {Object.entries(spec.item as ParamSchema).map(([key, s]) => (
            <ParamField key={key} spec={s} value={row[key]} onChange={(v) => set(i, key, v)} />
          ))}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, defaults()])}>
        Ajouter
      </button>
    </fieldset>
  );
}
