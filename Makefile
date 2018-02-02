.PHONY: compile
compile:
	tsc

.PHONY: test
test:
	npm test

.PHONY: deploy
deploy: clean test compile
	echo 'push'

clean:
	rm -rf dist/*
