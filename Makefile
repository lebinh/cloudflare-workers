.PHONY: compile
compile:
	tsc
	# dirty workaround to remove all export declaration in complied JS
	sed -i '.original' 's/^export //' dist/*.js

.PHONY: test
test:
	npm test

.PHONY: deploy
deploy: clean test compile
	# TODO

clean:
	rm -rf dist/*
