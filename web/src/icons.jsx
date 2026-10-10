// ícones do Instagram e da interface (símbolos SVG no index.html)
export const Icon = ({ name, size, className = '', style }) => (
  <svg className={'ico ' + className} style={{ width: size, height: size, ...style }} aria-hidden="true"><use href={'#i-' + name} /></svg>
);
