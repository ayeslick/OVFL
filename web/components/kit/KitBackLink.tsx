"use client";

import type { ReactNode } from "react";
import { KitIcon } from "./KitIcon";
import "./kit.css";
import "./surfaces.css";

export function KitBackLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      className="kit-text-button kit-breadcrumb"
      href={href}
      data-ui="UI-SHELL-BREADCRUMB"
      onClick={
        onClick
          ? (event) => {
              event.preventDefault();
              onClick();
            }
          : undefined
      }
    >
      <KitIcon name="back" />
      {children}
    </a>
  );
}
