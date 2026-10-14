<template>
  <div class='place-search'>
    <form class='search-field' role='search' @submit.prevent='search'>
      <label class='sr-only' for='place-query'>Buscar un lugar</label>
      <search-icon :size='17' class='search-icon' aria-hidden='true'/>
      <input id='place-query' ref='input' v-model='query' class='input search-input' type='search' autocomplete='off'
        placeholder='Ciudad, municipio o barrio' :disabled='disabled' enterkeyhint='search'>
      <button type='submit' class='btn btn-primary search-btn' :disabled='disabled || !query.trim() || searching'>
        <loader-circle v-if='searching' :size='16' class='spin'/>
        <span v-else>Buscar</span>
      </button>
    </form>

    <div v-if='error' class='notice notice-error search-message' role='alert'>
      <circle-alert :size='16'/>
      <span>No se pudo buscar el lugar. Revisa tu conexión. <button type='button' class='link-btn' @click='search'>Reintentar</button></span>
    </div>
    <div v-else-if='searched && !searching && !suggestions.length' class='notice search-message'>
      <info :size='16'/>
      <span>No se encontraron lugares con ese nombre. Prueba con otro nombre o añade el país.</span>
    </div>

    <ul v-if='suggestions.length' class='suggestions scroll-y' aria-label='Resultados de la búsqueda'>
      <li v-for='(suggestion, index) in suggestions' :key='index'>
        <button type='button' class='suggestion' @click='pick(suggestion)'>
          <map-pin :size='16' class='suggestion-icon'/>
          <span class='suggestion-text'>
            <span class='suggestion-name'>{{firstPart(suggestion.name)}}</span>
            <span class='suggestion-detail'>{{restPart(suggestion.name)}}</span>
          </span>
          <span class='badge'>{{placeType(suggestion.type)}}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script>
import {Search, LoaderCircle, MapPin, CircleAlert, Info} from 'lucide-vue-next';
import findBoundaryByName from '../lib/findBoundaryByName.js';

// Nominatim place types, as shown next to each search result.
const PLACE_TYPES = {
  administrative: 'administrativo',
  city: 'ciudad',
  town: 'pueblo',
  village: 'aldea',
  hamlet: 'caserío',
  suburb: 'barrio',
  neighbourhood: 'colonia',
  county: 'condado',
  state: 'estado',
  region: 'región',
  country: 'país',
  municipality: 'municipio',
  island: 'isla',
};

/**
 * Finds places by name with Nominatim and lets the user pick one as the
 * extraction area.
 */
export default {
  name: 'PlaceSearch',
  components: {SearchIcon: Search, LoaderCircle, MapPin, CircleAlert, Info},
  props: {
    initialQuery: {type: String, default: ''},
    disabled: Boolean
  },
  emits: ['select', 'query'],
  data() {
    return {
      query: this.initialQuery,
      searching: false,
      searched: false,
      error: null,
      suggestions: []
    };
  },
  mounted() {
    // Phones would open the keyboard over the map; only focus on wide screens.
    if (window.innerWidth > 720 && this.$refs.input) this.$refs.input.focus();
  },
  methods: {
    search() {
      let query = this.query.trim();
      if (!query) return;
      this.$emit('query', query);
      this.searching = true;
      this.error = null;
      this.suggestions = [];
      findBoundaryByName(query).then(suggestions => {
        this.suggestions = suggestions || [];
      }).catch(err => {
        console.error(err);
        this.error = err;
      }).finally(() => {
        this.searching = false;
        this.searched = true;
      });
    },
    pick(suggestion) {
      this.suggestions = [];
      this.searched = false;
      this.$emit('select', suggestion);
    },
    placeType(type) {
      return PLACE_TYPES[type] || type || 'lugar';
    },
    firstPart(name) {
      return (name || '').split(',')[0];
    },
    restPart(name) {
      return (name || '').split(',').slice(1).join(',').trim();
    }
  }
}
</script>

<style>
.search-field {
  position: relative;
  display: flex;
  gap: 6px;
}
.search-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-faint);
  pointer-events: none;
}
.search-input {
  flex: 1;
  min-width: 0;
  padding-left: 34px;
}
.search-input::-webkit-search-cancel-button {
  cursor: pointer;
}
.search-btn {
  height: 40px;
  min-width: 76px;
}
.search-message {
  margin-top: 10px;
}
.suggestions {
  max-height: 300px;
  margin: 10px 0 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.suggestion:hover,
.suggestion:focus-visible {
  background: var(--surface-2);
}
.suggestion-icon {
  flex-shrink: 0;
  color: var(--accent-text);
}
.suggestion-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.suggestion-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.suggestion-detail {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
