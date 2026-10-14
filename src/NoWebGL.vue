<template>
  <div class='absolute no-webgl'>
    <h3>WebGL no está activado :(</h3>
    <p>Este sitio dibuja millones de calles a la vez.</p>
    <p>
      Para dibujar tantos datos rápido usa <a href='https://get.webgl.org/'>WebGL</a>,
      que parece no estar disponible en este dispositivo.
    </p>
    <p>Prueba con otro dispositivo para usar este sitio.</p>
    <img src="https://i.imgur.com/Fbbe5a6.png" alt="ejemplo">
  </div>
</template>
<style lang="stylus" scoped>

.no-webgl {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 20px auto;
    position: absolute;
    top: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    text-align: center;
    padding: 8px;

    h3 {
      font-weight: normal;
      font-size: 32px;
      margin: 16px;
    }
    p {
      max-width: 400px;
      margin: 8px 0;
    }
    img {
      width: 100%;
      max-width: 1440px;
    }
}
</style>