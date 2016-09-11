all: build/ivs.js

# build/ivs.js: app/index2.js
# 	rm -rf build
# 	mkdir build
# 	# npm run browserify -- -t babelify -o build/ivs.js app/index2.js

build/ivs.js: app/index.js app/kludge.js
	rm -rf build
	mkdir build
	npm run browserify -- -t babelify -o build/ivs.js app/index.js
