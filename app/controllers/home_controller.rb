class HomeController < ApplicationController
  def index
    @hold_count = [[session[:pachinko_hold_count].to_i, 0].max, 4].min
  end
end
