import { Text, type TextProps } from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
  minWidth: 0,
};

// Plain text link in the anchor colour; Text props style the label
export function TextLink({
  href,
  children,
  ...text
}: TextProps & { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={linkStyle}>
      <Text size="sm" component="span" {...text}>
        {children}
      </Text>
    </Link>
  );
}
