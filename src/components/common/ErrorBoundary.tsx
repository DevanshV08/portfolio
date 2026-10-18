"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; onError?: (error: unknown) => void };

/** Renders nothing if its children throw, and reports the error. */
export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
