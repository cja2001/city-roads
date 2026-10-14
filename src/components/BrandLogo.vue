<template>
  <span class='brand-logo' :class='["tone-" + tone, {compact}]'>
    <svg class='brand-mark' viewBox='0 0 32 32' :width='size' :height='size' aria-hidden='true' focusable='false'>
      <rect width='32' height='32' rx='8' :fill='tone === "dark" ? "#162C46" : "#0B1424"'
        :stroke='tone === "dark" ? "#314258" : "none"' stroke-width='1'/>
      <path d='M5 21.5H27M11.5 5v22' fill='none' stroke='#FFFFFF' stroke-width='2.4' stroke-linecap='round'/>
      <path d='M21 13.5V27' fill='none' stroke='#94A3B8' stroke-width='1.8' stroke-linecap='round'/>
      <path d='M11.5 21.5 24.5 8.5' fill='none' stroke='#4DE1D2' stroke-width='2.8' stroke-linecap='round'/>
      <circle cx='11.5' cy='21.5' r='3.4' fill='#4DE1D2' :stroke='tone === "dark" ? "#162C46" : "#0B1424"' stroke-width='1.6'/>
      <circle cx='24.5' cy='8.5' r='2.3' fill='#4DE1D2'/>
    </svg>
    <span v-if='!compact' class='brand-text'>
      <span class='brand-name'>Street<span class='brand-name-accent'>Data</span></span>
      <span v-if='descriptor' class='brand-descriptor'>Geospatial Data Extractor</span>
    </span>
  </span>
</template>

<script>
/**
 * StreetData logo: a street crossing with one highlighted route, drawn in SVG
 * so it stays sharp at any size. `tone` is the background it sits on.
 */
export default {
  name: 'BrandLogo',
  props: {
    compact: {type: Boolean, default: false},
    descriptor: {type: Boolean, default: false},
    tone: {type: String, default: 'dark'},
    size: {type: Number, default: 30}
  }
}
</script>

<style>
.brand-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: inherit;
}
.brand-mark {
  flex-shrink: 0;
  display: block;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.brand-name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.3px;
}
.brand-logo.tone-dark .brand-name-accent {
  color: var(--sd-cyan);
}
.brand-logo.tone-light .brand-name-accent {
  color: #0B7F76;
}
.brand-descriptor {
  margin-top: 2px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  opacity: 0.7;
}
</style>
