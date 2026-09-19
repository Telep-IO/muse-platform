.PHONY: deploy setup status logs stop

deploy:
	@bash scripts/deploy.sh deploy

setup:
	@bash scripts/deploy.sh setup

status:
	@bash scripts/deploy.sh status

logs:
	@bash scripts/deploy.sh logs

stop:
	@bash scripts/deploy.sh stop
