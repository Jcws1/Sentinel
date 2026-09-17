import { useState } from 'react';
import { Copy } from 'lucide-react';

export function CopyValue({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  const [result, setResult] = useState('');
  const text = value == null ? undefined : String(value);
  return (
    <div className="copy-value">
      <dt>{label}</dt>
      <dd>
        <span>{text ?? 'Unavailable'}</span>
        {text !== undefined && (
          <button
            className="icon-button"
            aria-label={`Copy ${label}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setResult(`${label} copied`);
              } catch {
                setResult(
                  `Copy unavailable. Select the ${label.toLowerCase()} text to copy.`,
                );
              }
            }}
          >
            <Copy size={13} />
          </button>
        )}
      </dd>
      {result && (
        <span className="copy-result" role="status">
          {result}
        </span>
      )}
    </div>
  );
}
