"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

interface TabsContextValue {
  activeValue: string;
  setActiveValue: (v: string) => void;
  controlled: boolean;
  baseId: string;
  triggerRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  registerTrigger: (value: string, el: HTMLButtonElement | null) => void;
  triggerValues: string[];
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs compound must be inside <Tabs>");
  return ctx;
}

/* ------------------------------------------------------------------------- */
/* Tabs (root)                                                               */
/* ------------------------------------------------------------------------- */

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs = ({
  defaultValue,
  value,
  onValueChange,
  children,
  className = "",
}: TabsProps) => {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = controlled ? value : internalValue;
  const baseId = useId();
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [triggerValues, setTriggerValues] = useState<string[]>([]);

  const setActiveValue = useCallback(
    (v: string) => {
      if (!controlled) setInternalValue(v);
      onValueChange?.(v);
    },
    [controlled, onValueChange],
  );

  const registerTrigger = useCallback(
    (val: string, el: HTMLButtonElement | null) => {
      if (el) {
        triggerRefs.current.set(val, el);
        setTriggerValues((prev) => {
          if (prev.indexOf(val) !== -1) return prev;
          return [...prev, val];
        });
      } else {
        triggerRefs.current.delete(val);
        setTriggerValues((prev) => prev.filter((v) => v !== val));
      }
    },
    [],
  );

  useEffect(() => {
    if (controlled && value && !triggerRefs.current.has(value)) {
      setInternalValue(value);
    }
  }, [controlled, value]);

  const ctx = useMemo<TabsContextValue>(
    () => ({
      activeValue,
      setActiveValue,
      controlled,
      baseId,
      triggerRefs,
      registerTrigger,
      triggerValues,
    }),
    [activeValue, setActiveValue, controlled, baseId, registerTrigger, triggerValues],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

/* ------------------------------------------------------------------------- */
/* TabsList                                                                  */
/* ------------------------------------------------------------------------- */

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export const TabsList = ({ children, className = "" }: TabsListProps) => {
  const { triggerValues, triggerRefs, activeValue, setActiveValue } =
    useTabsContext();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const values = triggerValues;
    if (values.length === 0) return;
    const currentIndex = values.indexOf(activeValue);
    let next: string | undefined;

    switch (e.key) {
      case "ArrowRight":
        next = values[(currentIndex + 1) % values.length];
        break;
      case "ArrowLeft":
        next = values[(currentIndex - 1 + values.length) % values.length];
        break;
      case "Home":
        next = values[0];
        break;
      case "End":
        next = values[values.length - 1];
        break;
      default:
        return;
    }

    e.preventDefault();
    if (next) {
      setActiveValue(next);
      const el = triggerRefs.current.get(next) as unknown as { focus?: () => void };
      el?.focus?.();
    }
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`flex border-b-2 border-gray-200 dark:border-gray-700 ${className}`}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
};

/* ------------------------------------------------------------------------- */
/* TabsTrigger                                                               */
/* ------------------------------------------------------------------------- */

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const TabsTrigger = ({
  value,
  children,
  className = "",
  disabled = false,
}: TabsTriggerProps) => {
  const { activeValue, setActiveValue, baseId, registerTrigger } =
    useTabsContext();
  const ref = useRef<HTMLButtonElement>(null);
  const isActive = activeValue === value;

  useEffect(() => {
    registerTrigger(value, ref.current);
    return () => registerTrigger(value, null);
  }, [value, registerTrigger]);

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`${baseId}-trigger-${value}`}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => setActiveValue(value)}
      className={`
        px-3 py-2 text-sm font-medium transition-colors
        -mb-px
        border-b-2
        ${
          isActive
            ? "border-basketball text-gray-800 dark:text-gray-100 font-bold"
            : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

/* ------------------------------------------------------------------------- */
/* TabsContent                                                               */
/* ------------------------------------------------------------------------- */

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabsContent = ({
  value,
  children,
  className = "",
}: TabsContentProps) => {
  const { activeValue, baseId } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-trigger-${value}`}
      hidden={!isActive}
      className={className}
    >
      {children}
    </div>
  );
};
