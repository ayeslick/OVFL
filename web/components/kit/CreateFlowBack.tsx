"use client";

import { useEffect, useState } from "react";
import { createReturnLabel, HOME_PATH, readCreateReturn } from "@/lib/create-return";
import { KitBackLink } from "./KitBackLink";

export function CreateFlowBack() {
  const [href, setHref] = useState(HOME_PATH);
  const [label, setLabel] = useState("Your OVRFLO");

  useEffect(() => {
    const path = readCreateReturn();
    setHref(path);
    setLabel(createReturnLabel(path));
  }, []);

  return <KitBackLink href={href}>{label}</KitBackLink>;
}
