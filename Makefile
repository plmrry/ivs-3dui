all: build/ivs.js

ivs2: build2/ivs.js

# build/ivs.js: app/index2.js
# 	rm -rf build
# 	mkdir build
# 	# npm run browserify -- -t babelify -o build/ivs.js app/index2.js

build/ivs.js: app/index.js app/kludge.js
	rm -rf build
	mkdir build
	# npm run browserify -- -t babelify -o build/ivs.js app/index.js
	npm run rollup -- --config --input app/index.js --output build/ivs.js --name ivs

build2/ivs.js: app2/index.js
	rm -rf build2
	mkdir build2
	npm run rollup -- --config --input app2/index.js --output build2/ivs.js --name ivs
