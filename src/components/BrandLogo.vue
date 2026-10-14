<template>
  <span class='brand-logo' :class='["tone-" + tone, {compact}]'>
    <svg class='brand-mark' viewBox='0 0 32 32' :width='size' :height='size' aria-hidden='true' focusable='false'>
      <defs><clipPath :id='clipId'><rect width='32' height='32' rx='7'/></clipPath></defs>
      <rect width='32' height='32' rx='7' fill='#1E88E5'/>
      <g :clip-path='"url(#" + clipId + ")"' fill='none' stroke='#FFFFFF' stroke-linecap='round' stroke-linejoin='round'>
        <path d='M2 24 26-2M8 34 34 8M18 34 34 18M4 10 26 32M2 20 14 32' stroke-width='1.25'/>
        <path d='M13 31c2-6 5-8 9-8 4 0 6-3 6-7' stroke-width='2.4'/>
      </g>
      <circle cx='10' cy='10' r='6.2' fill='#1E88E5' stroke='#FFFFFF' stroke-width='1.6'/>
      <path d='M6.6 6.6 13.6 9.2 10.6 10.6 9.2 13.6Z' fill='#FFFFFF'/>
      <path d='M23.5 4.2a3.6 3.6 0 0 1 3.6 3.6c0 2.7-3.6 6.4-3.6 6.4s-3.6-3.7-3.6-6.4a3.6 3.6 0 0 1 3.6-3.6z' fill='#1E88E5' stroke='#FFFFFF' stroke-width='1.6'/>
      <circle cx='23.5' cy='7.8' r='1.3' fill='#FFFFFF'/>
    </svg>
    <span v-if='!compact' class='brand-text'>
      <span class='brand-name'>StreetData</span>
      <span v-if='descriptor' class='brand-descriptor'>Geospatial Data Extractor</span>
    </span>
  </span>
</template>

<script>
/**
 * StreetData logo (blue map tile with a navigation arrow and a pin), drawn
 * in SVG so it stays sharp at any size. `tone` is the background it sits on.
 */
let counter = 0;

export default {
  name: 'BrandLogo',
  props: {
    compact: {type: Boolean, default: false},
    descriptor: {type: Boolean, default: false},
    tone: {type: String, default: 'dark'},
    size: {type: Number, default: 30}
  },
  data() {
    return {clipId: 'brand-clip-' + (++counter)};
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
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
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
