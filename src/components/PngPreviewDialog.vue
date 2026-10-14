<template>
  <app-modal title='Vista previa del PNG' size='lg' @close='$emit("close")'>
    <div class='png-preview'>
      <div class='preview-frame'>
        <img :src='url' :alt='"Vista previa de " + fileName'>
      </div>
      <div class='preview-meta'>
        <span>{{width}} × {{height}} px</span>
        <span class='preview-file' :title='fileName'>{{fileName}}</span>
      </div>
    </div>
    <template #footer>
      <button type='button' class='btn' @click='$emit("close")'>Cerrar</button>
      <button type='button' class='btn btn-primary' autofocus @click='$emit("download")'>
        <download-icon :size='16'/> Descargar PNG
      </button>
    </template>
  </app-modal>
</template>

<script>
import {Download} from 'lucide-vue-next';
import AppModal from './AppModal.vue';

export default {
  name: 'PngPreviewDialog',
  components: {AppModal, DownloadIcon: Download},
  props: {
    url: String,
    width: Number,
    height: Number,
    fileName: String
  },
  emits: ['close', 'download']
}
</script>

<style>
.preview-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 60vh;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background:
    repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px;
}
.preview-frame img {
  display: block;
  max-width: 100%;
  max-height: calc(60vh - 16px);
  object-fit: contain;
  box-shadow: var(--shadow);
}
.preview-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.preview-file {
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
