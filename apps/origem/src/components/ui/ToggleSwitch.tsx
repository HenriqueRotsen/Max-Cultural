"use client";

type Props = {
  name: string;
  defaultChecked?: boolean;
  label: string;
  description?: string;
};

/** Switch on/off acessível (checkbox estilizado). */
export function ToggleSwitch({
  name,
  defaultChecked,
  label,
  description,
}: Props) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 text-sm">
      <span className="min-w-0">
        <span className="font-medium text-[var(--navy)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[var(--gray-500)]">{description}</span>
        ) : null}
      </span>
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[var(--gray-200)] transition peer-checked:bg-[var(--gold)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--navy)]"
        />
        <span
          aria-hidden
          className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
