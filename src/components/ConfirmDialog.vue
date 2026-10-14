<template>
  <app-modal :title='title' size='sm' @close='$emit("cancel")'>
    <p class='confirm-text'>{{message}}</p>
    <template #footer>
      <button type='button' class='btn' @click='$emit("cancel")'>Cancelar</button>
      <button type='button' class='btn btn-primary' autofocus @click='$emit("confirm")'>{{confirmLabel}}</button>
    </template>
  </app-modal>
</template>

<script>
import AppModal from './AppModal.vue';

export default {
  name: 'ConfirmDialog',
  components: {AppModal},
  props: {
    title: String,
    message: String,
    confirmLabel: {type: String, default: 'Continuar'}
  },
  emits: ['confirm', 'cancel']
}
</script>

<style>
.confirm-text {
  margin: 0;
  color: var(--text-muted);
}
</style>
