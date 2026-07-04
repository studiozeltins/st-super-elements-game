import { useId } from 'react';
import * as Switch from '@radix-ui/react-switch';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
}

// Reusable labelled switch on Radix: role=switch, keyboard support, aria-checked,
// and the label is wired to it via htmlFor. Styling is our own (.toggle__*).
export function Toggle({ label, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <div className="toggle">
      <label className="toggle__label" htmlFor={id}>
        {label}
      </label>
      <Switch.Root id={id} className="toggle__switch" checked={checked} onCheckedChange={onChange}>
        <Switch.Thumb className="toggle__knob" />
      </Switch.Root>
    </div>
  );
}
