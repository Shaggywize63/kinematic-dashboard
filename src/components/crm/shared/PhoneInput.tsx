'use client';
import { forwardRef } from 'react';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'inputMode' | 'pattern' | 'maxLength'> {
  value: string;
  onChange: (digits: string) => void;
  /** Override the cap (default 10). Use this if you ever need a different country's length. */
  maxDigits?: number;
}

/**
 * Numeric-only mobile input — strips every non-digit character on input
 * and caps at 10 digits by default. Use everywhere a 10-digit Indian
 * mobile number is captured (lead/contact create + edit, convert,
 * alternate mobiles).
 *
 * Behavioural details:
 *   - `inputMode="numeric"` brings up the digit-only keypad on mobile.
 *   - `maxLength={10}` blocks paste of longer strings from being kept
 *     in the input visually after our onChange runs (defence-in-depth).
 *   - `pattern="[0-9]{10}"` triggers the browser's native form
 *     validation hint, useful when the input sits in a `<form>`.
 *   - `autoComplete="tel-national"` lets browsers offer the saved
 *     national number rather than the +CC-prefixed one.
 */
export default forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, maxDigits = 10, placeholder = '10-digit mobile', ...rest },
  ref,
) {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, maxDigits);
    onChange(digits);
  };
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="numeric"
      pattern={`[0-9]{${maxDigits}}`}
      maxLength={maxDigits}
      value={value}
      onChange={handle}
      placeholder={placeholder}
      autoComplete="tel-national"
      {...rest}
    />
  );
});
