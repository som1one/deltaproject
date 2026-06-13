"use client";

import { Component, type ReactNode } from "react";
import styles from "./marketplace-ui.module.css";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Fallback UI when an error is caught */
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * React Error Boundary for marketplace pages.
 * Catches rendering errors and displays a retry option.
 * Validates: Requirement 12.6
 */
export class MarketplaceErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorDisplay
          title="Произошла ошибка"
          message="Что-то пошло не так. Попробуйте ещё раз."
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

type ErrorDisplayProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

/**
 * Reusable error display component with retry button.
 * Used for both error boundary fallbacks and timeout errors.
 * Validates: Requirement 12.6
 */
export function ErrorDisplay({
  title = "Произошла ошибка",
  message = "Что-то пошло не так. Попробуйте ещё раз.",
  onRetry,
  retryLabel = "Попробовать снова",
}: ErrorDisplayProps) {
  return (
    <div className={styles.errorContainer} role="alert">
      <div className={styles.errorIcon} aria-hidden="true">
        ⚠
      </div>
      <h2 className={styles.errorTitle}>{title}</h2>
      <p className={styles.errorMessage}>{message}</p>
      {onRetry && (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

type TimeoutErrorProps = {
  onRetry: () => void;
};

/**
 * Timeout-specific error display.
 * Shown when an async operation exceeds 30 seconds.
 * Validates: Requirement 12.6
 */
export function TimeoutError({ onRetry }: TimeoutErrorProps) {
  return (
    <ErrorDisplay
      title="Время ожидания истекло"
      message="Операция заняла слишком много времени. Проверьте подключение к интернету и попробуйте снова."
      onRetry={onRetry}
      retryLabel="Повторить"
    />
  );
}
