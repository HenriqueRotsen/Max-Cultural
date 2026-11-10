"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";

/**
 * Select com busca de todos os apps MAX (nasceu no Fluxo/Indicadores).
 * Busca sem acento e por partes ("sao jo" acha "São João"). Funciona:
 *  - controlado: `value` + `onValueChange`;
 *  - em formulário: `name` (+ `defaultValue`, `required`), como um <select>;
 *  - `submitOnChange` envia o formulário ao escolher (filtros de página).
 * Estilo em `search-select.css` (cores das variáveis de cada app); o trigger
 * aceita `className` para ajustar.
 */
export type SearchSelectOption = {
  value: string;
  label: string;
  /** Texto secundário (ex.: PRONAC, cidade/UF). Também entra na busca. */
  hint?: string;
  disabled?: boolean;
};

export function normalizeSearchText(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function searchSelectMatches(item: SearchSelectOption, query: string) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const hay = normalizeSearchText(`${item.label} ${item.hint ?? ""}`);
  return q.split(/\s+/).every((part) => hay.includes(part));
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ChevronsIcon() {
  return (
    <svg className="mx-ss-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="mx-ss-search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="mx-ss-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export type SearchSelectProps = {
  options: SearchSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Busca no servidor (lista paginada); a filtragem local continua valendo. */
  onSearch?: (query: string) => void;
  /** Classes extras do botão (trigger). */
  className?: string;
  /** Classes extras do painel. */
  popupClassName?: string;
  id?: string;
  /** Nome do campo no formulário (vai num input escondido). */
  name?: string;
  required?: boolean;
  /** Atributo `form` do input escondido (formulário fora do pai). */
  form?: string;
  /** Envia o formulário do campo ao escolher. */
  submitOnChange?: boolean;
  showHintInTrigger?: boolean;
  /** Opção vazia no topo (ex.: "Todos"), com valor "". */
  emptyOption?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  title?: string;
};

export function SearchSelect({
  options,
  value: valueProp,
  defaultValue = "",
  onValueChange,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  disabled,
  onSearch,
  className,
  popupClassName,
  id,
  name,
  required,
  form,
  submitOnChange,
  showHintInTrigger = true,
  emptyOption,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  title,
}: SearchSelectProps) {
  const controlled = valueProp !== undefined;
  const [inner, setInner] = React.useState(defaultValue);
  // Filtros de página (GET): o Next mantém o componente entre navegações; se o
  // valor vindo da URL mudar (aplicar/limpar), o select acompanha.
  const [lastDefault, setLastDefault] = React.useState(defaultValue);
  if (defaultValue !== lastDefault) {
    setLastDefault(defaultValue);
    setInner(defaultValue);
  }
  const value = controlled ? valueProp : inner;
  const hiddenRef = React.useRef<HTMLInputElement>(null);
  const [submitTick, setSubmitTick] = React.useState(0);

  const items = React.useMemo(
    () => (emptyOption !== undefined ? [{ value: "", label: emptyOption }, ...options] : options),
    [options, emptyOption],
  );

  const selected = React.useMemo(
    () => items.find((o) => o.value === value) ?? null,
    [items, value],
  );
  // Mantém o rótulo do selecionado mesmo se a busca no servidor o tirar da lista.
  const [lastSelected, setLastSelected] = React.useState<SearchSelectOption | null>(null);
  if (selected && selected !== lastSelected) setLastSelected(selected);
  // Valor gravado fora da lista (ex.: dado antigo) continua visível, como no <select>.
  const current =
    selected ??
    (lastSelected?.value === value ? lastSelected : null) ??
    (value ? { value, label: value } : null);

  React.useEffect(() => {
    if (!submitTick) return;
    hiddenRef.current?.form?.requestSubmit();
  }, [submitTick]);

  function change(next: string) {
    if (!controlled) setInner(next);
    onValueChange?.(next);
    if (submitOnChange) setSubmitTick((t) => t + 1);
  }

  const showPlaceholder = !current || (current.value === "" && !current.label);

  return (
    <>
      <Combobox.Root
        items={items}
        value={current}
        onValueChange={(item) => change((item as SearchSelectOption | null)?.value ?? "")}
        onInputValueChange={(q) => onSearch?.(q)}
        itemToStringLabel={(item) => (item as SearchSelectOption).label}
        isItemEqualToValue={(a, b) =>
          (a as SearchSelectOption).value === (b as SearchSelectOption).value
        }
        filter={(item, q) => searchSelectMatches(item as SearchSelectOption, q)}
        disabled={disabled}
        autoHighlight
      >
        <Combobox.Trigger
          id={id}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          title={title}
          data-placeholder={showPlaceholder ? "" : undefined}
          className={cx("mx-ss-trigger", className)}
        >
          <span className="mx-ss-value">
            {!showPlaceholder && current ? (
              <>
                {current.label}
                {current.hint && showHintInTrigger ? (
                  <span className="mx-ss-value-hint"> · {current.hint}</span>
                ) : null}
              </>
            ) : (
              <span className="mx-ss-placeholder">{placeholder}</span>
            )}
          </span>
          <ChevronsIcon />
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner
            align="start"
            sideOffset={4}
            collisionPadding={12}
            className="mx-ss-positioner"
          >
            <Combobox.Popup
              className={cx("mx-ss-popup", popupClassName)}
              aria-label={ariaLabel ?? placeholder}
            >
              <div className="mx-ss-search">
                <SearchIcon />
                <Combobox.Input placeholder={searchPlaceholder} className="mx-ss-input" />
              </div>
              <Combobox.Empty>
                <div className="mx-ss-empty">{emptyText}</div>
              </Combobox.Empty>
              <Combobox.List className="mx-ss-list">
                {(item: SearchSelectOption) => (
                  <Combobox.Item
                    key={item.value || "__vazio__"}
                    value={item}
                    disabled={item.disabled}
                    className="mx-ss-item"
                  >
                    <Combobox.ItemIndicator className="mx-ss-indicator">
                      <CheckIcon />
                    </Combobox.ItemIndicator>
                    <span className="mx-ss-item-text">
                      <span className="mx-ss-item-label">{item.label}</span>
                      {item.hint ? <span className="mx-ss-item-hint">{item.hint}</span> : null}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {name || required || submitOnChange ? (
        <input
          ref={hiddenRef}
          // `required` precisa de um campo validável: fica invisível, mas o
          // navegador ainda mostra o aviso de "preencha este campo".
          className="mx-ss-native"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          form={form}
          required={required}
          disabled={disabled}
          value={value}
          onChange={() => {}}
        />
      ) : null}
    </>
  );
}
