<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="path"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
  color: { type: String, default: 'currentColor' },
  strokeWidth: { type: [Number, String], default: 1.75 }
})

// 线性图标集（Lucide 风格）
const ICONS = {
  workbench: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  nutrition: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  recipes: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  foods: '<path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/><path d="M12 21c0-5 2-8 6-9"/><path d="M12 5c0 3-1.5 5-4 6"/>',
  mapping: '<path d="M9 4h10a1 1 0 0 1 1 1v10"/><path d="M15 20H5a1 1 0 0 1-1-1V9"/><path d="M8 13l3 3 6-6"/>',
  prices: '<path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  dishes: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M2 12h20"/><path d="M6 16h12"/><path d="M12 4v-1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  arrowUp: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  flame: '<path d="M12 2c1.5 4 5 5.5 5 9a5 5 0 0 1-10 0c0-1.6.6-2.8 1.5-4"/><path d="M12 22a5 5 0 0 0 5-5"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-9h7v7a9 9 0 0 1-9 9z"/><path d="M4 21c2-6 6-9 11-10"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M18 20a6 6 0 0 0-2-4.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/>',
  spark: '<path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5"/><circle cx="12" cy="12" r="3"/>',
  trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  scale: '<path d="M12 3v18"/><path d="M6 7l-4 8h8z"/><path d="M18 7l-4 8h8z"/>',
  bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v9M19 10v9"/><path d="M3 21h18"/><path d="M9 13v6M15 13v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 21h16"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  close: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  book: '<path d="M4 4a2 2 0 0 1 2-2h13v20H6a2 2 0 0 1-2-2z"/><path d="M8 2v20"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'
}

const path = computed(() => ICONS[props.name] || ICONS.target)
</script>