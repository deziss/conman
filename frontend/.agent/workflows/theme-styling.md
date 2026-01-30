---
description: Frontend styling conventions for light/dark mode support
---

# Theme-Aware Styling Guidelines

This document defines the styling conventions for the ConMan frontend to ensure proper light/dark mode support. **Follow these patterns for all new components and pages.**

## Core Principles

1. **Never use hardcoded dark-theme colors** - Always provide light mode variants
2. **Use the `dark:` prefix** for dark mode specific styles
3. **Text should be readable in both modes** - Dark text on light bg, light text on dark bg

---

## Color Patterns

### Text Colors

| Element           | Light Mode   | Dark Mode    | Tailwind Class                         |
| ----------------- | ------------ | ------------ | -------------------------------------- |
| Primary headings  | `slate-900`  | `white`      | `text-slate-900 dark:text-white`       |
| Secondary text    | `slate-600`  | `slate-400`  | `text-slate-600 dark:text-slate-400`   |
| Muted/helper text | `slate-500`  | `slate-500`  | `text-slate-500`                       |
| Links (cyan)      | `cyan-600`   | `cyan-400`   | `text-cyan-600 dark:text-cyan-400`     |
| Links (purple)    | `purple-600` | `purple-400` | `text-purple-600 dark:text-purple-400` |

### Background Colors

| Element            | Light Mode             | Dark Mode      | Tailwind Class                            |
| ------------------ | ---------------------- | -------------- | ----------------------------------------- |
| Card backgrounds   | `white/70`             | `white/5`      | (handled by GlassCard)                    |
| Input backgrounds  | `white` or `slate-100` | `slate-800/50` | `bg-white dark:bg-slate-800/50`           |
| Hover states       | `slate-50`             | `white/5`      | `hover:bg-slate-50 dark:hover:bg-white/5` |
| Progress bar track | `slate-200`            | `slate-800`    | `bg-slate-200 dark:bg-slate-800`          |

### Border Colors

| Element       | Light Mode  | Dark Mode      | Tailwind Class                              |
| ------------- | ----------- | -------------- | ------------------------------------------- |
| Card borders  | `slate-200` | `white/10`     | `border-slate-200 dark:border-white/10`     |
| Dividers      | `slate-100` | `white/5`      | `divide-slate-100 dark:divide-white/5`      |
| Input borders | `slate-200` | `slate-700/50` | `border-slate-200 dark:border-slate-700/50` |

---

## Status Badges

Status badges should use semantic colors with proper light/dark variants:

### Running/Active/Success (Emerald)

```tsx
className =
  "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20";
```

### Stopped/Exited/Inactive (Slate)

```tsx
className =
  "bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-500 border border-slate-200 dark:border-slate-600";
```

### Warning/Used (Amber)

```tsx
className =
  "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20";
```

### Danger/Error (Rose)

```tsx
className =
  "bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20";
```

---

## Buttons

### Primary Action Buttons

Primary buttons can stay solid colored (they work in both modes):

```tsx
className = "bg-cyan-500 hover:bg-cyan-600 text-white";
```

### Ghost/Outline Buttons

```tsx
className =
  "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-500 hover:text-white";
```

### Neutral Buttons

```tsx
className =
  "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10";
```

---

## Tables

### Table Header

```tsx
<thead className="bg-slate-100 dark:bg-black/20 text-xs text-slate-500 uppercase font-medium">
```

### Table Body

```tsx
<tbody className="divide-y divide-slate-100 dark:divide-white/5">
```

### Table Rows

```tsx
<tr className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
```

### Table Cell Text

```tsx
// Primary content
<td className="text-slate-900 dark:text-white">

// Secondary content
<td className="text-slate-600 dark:text-slate-400">
```

---

## Form Inputs

### Text Inputs

```tsx
<input className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
```

### Select Dropdowns

```tsx
<select className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 rounded-lg p-2 outline-none">
```

---

## Page Headers

### Gradient Text (works in both modes)

```tsx
<h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
```

### Colored Gradient Text

```tsx
// Cyan theme
<h2 className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400">

// Purple theme
<h2 className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">
```

---

## Cards with Custom Headers

When using a custom colored header section within a GlassCard:

```tsx
<div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-8">
  <h1 className="text-slate-900 dark:text-white">Title</h1>
  <p className="text-slate-500 dark:text-slate-400">Description</p>
</div>
```

---

## Icon Colors

Icons should follow the same patterns as text:

### In headings/prominent positions

```tsx
<Icon className="text-slate-900 dark:text-white" />
```

### Action icons (interactive)

```tsx
<Icon className="text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400" />
```

### Semantic icons

```tsx
// Success
<Icon className="text-emerald-600 dark:text-emerald-400" />

// Warning
<Icon className="text-amber-600 dark:text-amber-400" />

// Danger
<Icon className="text-rose-600 dark:text-rose-500" />
```

---

## Quick Reference Checklist

When creating a new component or page, ensure:

- [ ] All `text-white` classes have a `text-slate-900 dark:text-white` alternative
- [ ] Background colors use light/dark variants (not just `bg-slate-800`)
- [ ] Borders use `border-slate-200 dark:border-white/10` pattern
- [ ] Table dividers use `divide-slate-100 dark:divide-white/5`
- [ ] Input fields have light backgrounds in light mode
- [ ] Status badges follow the semantic color patterns above
- [ ] Links use `-600` in light mode, `-400` in dark mode
