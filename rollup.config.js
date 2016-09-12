import babel from 'rollup-plugin-babel';
import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

function glsl () {
	return {
		transform ( code, id ) {
			if ( !/\.glsl$/.test( id ) ) return;

			return 'export default ' + JSON.stringify(
				code
					.replace( /[ \t]*\/\/.*\n/g, '' )
					.replace( /[ \t]*\/\*[\s\S]*?\*\//g, '' )
					.replace( /\n{2,}/g, '\n' )
			) + ';';
		}
	};
}

export default {
  // entry: 'app2/index.js',
  plugins: [
    nodeResolve(),
    commonjs({
      include: 'node_modules/**',
			exclude: [ 'node_modules/three/**' ]
    }),
    glsl(),
    babel({
      // babelrc: false,
      exclude: 'node_modules/**'
    })
  ],
	moduleName: 'ivs',
  format: 'iife'
};
