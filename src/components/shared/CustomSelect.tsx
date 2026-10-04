import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Theme } from '../../types';
import {
    CustomSelectMenu,
    type CustomSelectOption,
} from './CustomSelectMenu';
import { useCustomSelectPosition } from './useCustomSelectPosition';
import { useCustomSelectKeyboard } from './useCustomSelectKeyboard';
import type { CustomSelectMenuNavigation } from './useCustomSelectOptionFocus';

// CustomSelect.tsx
// A custom dropdown select component designed to replace the browser's default select element.
// Styled to match the rest of the application, handling light/dark mode and dynamic themes.

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: CustomSelectOption[];
    /** Fired right before the menu opens, so callers can populate `options` on first demand. */
    onOpen?: () => void;
    placeholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
    isDaylight?: boolean;
    theme?: Theme;
    className?: string;
    /** Non-interactive decoration inside the same semantic trigger button. */
    triggerPrefix?: React.ReactNode;
    menuClassName?: string;
    /** Let a CSS skin own entry motion without a competing Motion transform. */
    menuMotion?: 'default' | 'css';
    menuMinWidth?: number;
    getPortalContainer?: () => HTMLElement | null;
    getClipElement?: () => HTMLElement | null;
    getAnchorElement?: () => HTMLElement | null;
    keyboardNavigation?: boolean;
    /** Optional action following the options, kept separate from the selectable values. */
    menuAction?: { label: string; onAction: () => void };
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    value,
    onChange,
    options,
    onOpen,
    placeholder = 'Select...',
    ariaLabel,
    disabled = false,
    isDaylight = false,
    theme,
    className,
    triggerPrefix,
    menuClassName,
    menuMotion = 'default',
    menuMinWidth = 0,
    getPortalContainer,
    getClipElement,
    getAnchorElement,
    keyboardNavigation = false,
    menuAction,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuNavigation = useRef<CustomSelectMenuNavigation | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();
    const close = useCallback(() => { menuNavigation.current?.cancelFocus(); setIsOpen(false); }, []);
    const show = () => { if (!disabled) { onOpen?.(); setIsOpen(true); } };

    // Positions the portaled menu against the trigger and flips it when viewport space is limited.
    const dropdownPosition = useCustomSelectPosition({ open: isOpen, container: containerRef, menu: menuRef,
        minWidth: menuMinWidth, getClipElement, getAnchorElement, close });
    const key = useCustomSelectKeyboard({ enabled: keyboardNavigation, open: isOpen, ready: Boolean(dropdownPosition),
        value, options, navigation: menuNavigation, trigger: triggerRef, show, close });
    const handleKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (keyboardNavigation && isOpen && menuAction && event.key === 'Tab') {
            const footer = menuRef.current?.querySelector<HTMLButtonElement>('[data-custom-select-footer]');
            if (event.target === footer && event.shiftKey) {
                event.preventDefault(); menuNavigation.current?.focusOption(Math.max(0, options.findIndex(option => option.value === value))); return;
            }
            if (event.target !== footer && !event.shiftKey && footer) {
                event.preventDefault(); footer.focus({ preventScroll: true }); return;
            }
        }
        key(event);
    };

    // Toggle the dropdown menu visibility
    const handleToggle = () => {
        if (disabled) {
            return;
        }

        if (isOpen) close(); else show();
    };

    // Close the dropdown when clicking outside of the container
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                containerRef.current
                && !containerRef.current.contains(target)
                && !menuRef.current?.contains(target)
            ) {
                close();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [close]);

    useEffect(() => { if (disabled) close(); }, [disabled, close]);

    const selectedOption = options.find((opt) => opt.value === value);
    const accentColor = theme?.accentColor || (isDaylight ? '#44403c' : '#f4f4f5');
    // The menu is portaled to document.body, so it cannot inherit the app container's theme variables.
    const textColor = theme?.primaryColor || (isDaylight ? '#1c1917' : '#f4f4f5');
    const borderColor = isDaylight ? 'rgba(28, 25, 23, 0.14)' : 'rgba(244, 244, 245, 0.14)';

    return (
        <div ref={containerRef} className={`relative w-full ${className ?? ''}`} onKeyDown={handleKey}
            onBlurCapture={event => { if (keyboardNavigation && !containerRef.current?.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) close(); }}>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleToggle}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                role={keyboardNavigation ? 'combobox' : undefined}
                aria-controls={isOpen ? menuId : undefined}
                data-value={value}
                className="w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                style={{
                    backgroundColor: 'var(--overlay-medium)',
                    borderColor: isOpen ? accentColor : 'var(--border-color)',
                    color: 'var(--text-primary)',
                    boxShadow: isOpen ? `0 0 0 1px ${accentColor}` : undefined,
                }}
            >
                {triggerPrefix && <span className="custom-select-prefix flex items-center shrink-0" aria-hidden="true">{triggerPrefix}</span>}
                <span className="truncate">
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 shrink-0 opacity-70 ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--text-secondary)' }}
                />
            </button>

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isOpen && dropdownPosition && (
                        <CustomSelectMenu
                            id={menuId}
                            className={menuClassName}
                            menuMotion={menuMotion}
                            keyboardNavigation={keyboardNavigation}
                            navigationRef={menuNavigation}
                            menuRef={menuRef}
                            position={dropdownPosition}
                            options={options}
                            value={value}
                            ariaLabel={ariaLabel}
                            isDaylight={isDaylight}
                            accentColor={accentColor}
                            textColor={textColor}
                            borderColor={borderColor}
                            menuAction={menuAction ? { label: menuAction.label, onAction: () => {
                                close(); menuAction.onAction();
                            } } : undefined}
                            onSelect={(nextValue) => {
                                onChange(nextValue);
                                close();
                                if (keyboardNavigation) triggerRef.current?.focus({ preventScroll: true });
                            }}
                        />
                    )}
                </AnimatePresence>,
                getPortalContainer?.() ?? document.body,
            )}
        </div>
    );
};
