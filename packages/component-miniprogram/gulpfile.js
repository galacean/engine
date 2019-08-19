const gulpfile = require('gulp');
const babel = require('gulp-babel');

gulpfile.task('default', () =>
  gulpfile.src('./src/index.js')
    .pipe(babel({
      presets: ['@babel/env']
    }))
    .pipe(gulpfile.dest('dist'))
);
