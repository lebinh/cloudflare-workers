scripts := $(wildcard src/*.ts)
outputs := $(patsubst src/%.ts,dist/%.js,$(scripts))
basenames := $(patsubst src/%.ts,%,$(scripts))

.PHONY: compile
compile: $(outputs)

dist/%.js: src/%.ts
	tsc --outDir dist --strict --target esnext $<
	@# quick workaround to remove all export declaration in complied JS
	@sed -i '' -e 's/^export //' dist/*.js

.PHONY: test
test:
	npm test

.PHONY: deploy
deploy:
ifndef CF_AUTH_EMAIL
	$(error CF_AUTH_EMAIL is not set)
endif
ifndef CF_AUTH_KEY
	$(error CF_AUTH_KEY is not set)
endif
	@$(foreach s,$(basenames),$(call upload,$(s)))

clean:
	rm -rf dist/*

define upload
    echo 'Uploading "$(1)"'
	curl -XPUT "https://api.cloudflare.com/client/v4/user/workers/scripts/$(1)" -H 'X-Auth-Email:$(CF_AUTH_EMAIL)' -H 'X-Auth-Key:$(CF_AUTH_KEY)' -H 'Content-Type: application/javascript' --data-binary "@dist/$(1).js";
	echo;
endef
